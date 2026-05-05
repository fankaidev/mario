import { Hono } from "hono";
import { auth, type AuthVariables } from "./middleware/auth";
import type { Bindings } from "./types";
import portfolios from "./routes/portfolios";
import transactions from "./routes/transactions";
import transfers from "./routes/transfers";
import prices, { syncPriceHistory } from "./routes/prices";
import tokens from "./routes/tokens";
import tags from "./routes/tags";
import corporateActions from "./routes/corporate-actions";
import cashMovements from "./routes/cash-movements";
import snapshots, { calculateSnapshot } from "./routes/snapshots";
import exchangeRates from "./routes/exchange-rates";
import summaryRoutes from "./routes/summary";
import importRoutes from "./routes/import";
import type { PriceFetcher } from "./clients/price-fetcher";
import { FetcherRouter } from "./clients/fetcher-router";
import { syncExchangeRates } from "./routes/exchange-rates";

export const app = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>();

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
app.route("/api/portfolios/:portfolioId/cash-movements", cashMovements);
app.route("/api/portfolios/:portfolioId/snapshots", snapshots);
app.route("/api/portfolios/:portfolioId/import", importRoutes);
app.route("/api/exchange-rates", exchangeRates);
app.route("/api/summary", summaryRoutes);

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

    // Sync exchange rates before price sync
    try {
      const ratesCount = await syncExchangeRates(env.DB);
      console.log(`Exchange rates synced: ${ratesCount} records`);
    } catch (err) {
      console.error("Exchange rate sync failed:", err);
    }

    // Sync price history for all held symbols
    const symbols = await env.DB.prepare(
      "SELECT DISTINCT symbol FROM lots WHERE remaining_quantity > 0",
    ).all<{
      symbol: string;
    }>();

    let totalRecords = 0;
    for (const { symbol } of symbols.results) {
      totalRecords += await syncPriceHistory(env.DB, fetcher, symbol);
    }
    console.log(`Scheduled price sync: ${totalRecords} records updated`);

    const portfolios = await env.DB.prepare(
      "SELECT id FROM portfolios WHERE archived = 0 AND deleted_at IS NULL",
    ).all<{
      id: number;
    }>();
    const today = new Date().toISOString().split("T")[0]!;

    let snapshotCount = 0;
    for (const { id: portfolioId } of portfolios.results) {
      const existing = await env.DB.prepare(
        "SELECT id FROM portfolio_snapshots WHERE portfolio_id = ? AND date = ?",
      )
        .bind(portfolioId, today)
        .first();
      if (existing) continue;

      const calculated = await calculateSnapshot(env.DB, portfolioId, today);
      if (calculated.missing_prices.length > 0) {
        console.warn(
          `Skipped snapshot for portfolio ${portfolioId}: missing prices for ${calculated.missing_prices.join(", ")}`,
        );
        continue;
      }

      await env.DB.prepare(
        "INSERT INTO portfolio_snapshots (portfolio_id, date, total_investment, market_value, cash_balance) VALUES (?, ?, ?, ?, ?)",
      )
        .bind(
          portfolioId,
          today,
          calculated.total_investment,
          calculated.market_value,
          calculated.cash_balance,
        )
        .run();
      snapshotCount++;
    }
    console.log(`Scheduled snapshots generated for ${snapshotCount} portfolios`);
  },
};
