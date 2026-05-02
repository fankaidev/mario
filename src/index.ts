import { Hono } from "hono";
import { auth, type AuthVariables } from "./middleware/auth";
import type { Bindings } from "./types";
import portfolios from "./routes/portfolios";
import transactions from "./routes/transactions";
import transfers from "./routes/transfers";
import prices, { getLatestPrice, syncPriceHistory } from "./routes/prices";
import tokens from "./routes/tokens";
import tags from "./routes/tags";
import corporateActions from "./routes/corporate-actions";
import snapshots from "./routes/snapshots";
import type { PriceFetcher } from "./clients/price-fetcher";
import { FetcherRouter } from "./clients/fetcher-router";

const app = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>();

app.get("/api/health", (c) => c.json({ status: "ok" }));

app.use("/api/*", auth);

app.get("/api/me", (c) => {
  const user = c.get("user");
  return c.json({ data: { id: user.id, email: user.email } });
});

app.route("/api/portfolios", portfolios);
app.route("/api/portfolios/:portfolioId/transactions", transactions);
app.route("/api/portfolios/:portfolioId/transfers", transfers);
app.route("/api/prices", prices);
app.route("/api/tokens", tokens);
app.route("/api/portfolios/:portfolioId/tags", tags);
app.route("/api/portfolios/:portfolioId/corporate-actions", corporateActions);
app.route("/api/portfolios/:portfolioId/snapshots", snapshots);

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: Bindings) {
    const apiKey = env.FINNHUB_API_KEY;
    if (!apiKey) {
      console.error("Scheduled price update skipped: FINNHUB_API_KEY not configured");
      return;
    }

    const finnhub: PriceFetcher = {
      async fetchPrice(symbol: string) {
        const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}`, {
          headers: { "X-Finnhub-Token": apiKey },
        });
        if (res.ok) {
          const body = (await res.json()) as { c: number };
          if (typeof body.c === "number" && body.c > 0) return body.c;
        }
        return null;
      },
      async fetchName(symbol: string) {
        const res = await fetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${symbol}`, {
          headers: { "X-Finnhub-Token": apiKey },
        });
        if (res.ok) {
          const body = (await res.json()) as { name: string };
          if (typeof body.name === "string" && body.name.length > 0) return body.name;
        }
        return null;
      },
    };

    const fetcher = new FetcherRouter(finnhub);

    // Sync price history for all held symbols
    const symbols = await env.DB.prepare("SELECT DISTINCT symbol FROM lots WHERE closed = 0").all<{
      symbol: string;
    }>();

    let totalRecords = 0;
    for (const { symbol } of symbols.results) {
      totalRecords += await syncPriceHistory(env.DB, fetcher, symbol);
    }
    console.log(`Scheduled price sync: ${totalRecords} records updated`);

    const portfolios = await env.DB.prepare(
      "SELECT id, cash_balance FROM portfolios WHERE archived = 0",
    ).all<{
      id: number;
      cash_balance: number;
    }>();
    const today = new Date().toISOString().split("T")[0];

    for (const { id: portfolioId, cash_balance: cashBalance } of portfolios.results) {
      const existing = await env.DB.prepare(
        "SELECT id FROM portfolio_snapshots WHERE portfolio_id = ? AND date = ?",
      )
        .bind(portfolioId, today)
        .first();
      if (existing) continue;

      const investmentRow = await env.DB.prepare(
        "SELECT COALESCE(SUM(CASE WHEN type = 'deposit' THEN amount - fee ELSE -(amount + fee) END), 0) AS total FROM transfers WHERE portfolio_id = ?",
      )
        .bind(portfolioId)
        .first<{ total: number }>();

      const lots = await env.DB.prepare(
        "SELECT symbol, remaining_quantity FROM lots WHERE portfolio_id = ? AND closed = 0",
      )
        .bind(portfolioId)
        .all<{ symbol: string; remaining_quantity: number }>();

      let marketValue = 0;
      for (const lot of lots.results) {
        const price = await getLatestPrice(env.DB, lot.symbol);
        if (price !== null) {
          marketValue += lot.remaining_quantity * price;
        }
      }

      await env.DB.prepare(
        "INSERT INTO portfolio_snapshots (portfolio_id, date, total_investment, market_value, cash_balance) VALUES (?, ?, ?, ?, ?)",
      )
        .bind(portfolioId, today, investmentRow?.total ?? 0, marketValue, cashBalance)
        .run();
    }
    console.log(`Scheduled snapshots generated for ${portfolios.results.length} portfolios`);
  },
};
