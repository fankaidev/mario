import { Hono } from "hono";
import { auth, type AuthVariables } from "./middleware/auth";
import type { Bindings } from "./types";
import portfolios from "./routes/portfolios";
import transactions from "./routes/transactions";
import prices, { updatePrices } from "./routes/prices";
import tokens from "./routes/tokens";
import tags from "./routes/tags";
import corporateActions from "./routes/corporate-actions";
import snapshots from "./routes/snapshots";
import type { PriceFetcher } from "./clients/price-fetcher";

const app = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>();

app.get("/api/health", (c) => c.json({ status: "ok" }));

app.use("/api/*", auth);

app.get("/api/me", (c) => {
  const user = c.get("user");
  return c.json({ data: { id: user.id, email: user.email } });
});

app.route("/api/portfolios", portfolios);
app.route("/api/portfolios/:portfolioId/transactions", transactions);
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

    const fetcher: PriceFetcher = {
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
    };

    const updated = await updatePrices(env.DB, fetcher);
    console.log(`Scheduled price update: ${updated} stocks updated`);

    const portfolios = await env.DB.prepare("SELECT id FROM portfolios WHERE archived = 0").all<{
      id: number;
    }>();
    const today = new Date().toISOString().split("T")[0];

    for (const { id: portfolioId } of portfolios.results) {
      const existing = await env.DB.prepare(
        "SELECT id FROM portfolio_snapshots WHERE portfolio_id = ? AND date = ?",
      )
        .bind(portfolioId, today)
        .first();
      if (existing) continue;

      const buyRow = await env.DB.prepare(
        "SELECT COALESCE(SUM(quantity * price + fee), 0) AS total FROM transactions WHERE portfolio_id = ? AND type IN ('buy', 'initial')",
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
        const priceRow = await env.DB.prepare("SELECT price FROM prices WHERE symbol = ?")
          .bind(lot.symbol)
          .first<{ price: number }>();
        if (priceRow?.price) {
          marketValue += lot.remaining_quantity * priceRow.price;
        }
      }

      await env.DB.prepare(
        "INSERT INTO portfolio_snapshots (portfolio_id, date, total_investment, market_value) VALUES (?, ?, ?, ?)",
      )
        .bind(portfolioId, today, buyRow?.total ?? 0, marketValue)
        .run();
    }
    console.log(`Scheduled snapshots generated for ${portfolios.results.length} portfolios`);
  },
};
