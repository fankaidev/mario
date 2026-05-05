import { Hono } from "hono";
import type { AuthVariables } from "../middleware/auth";
import type { Bindings } from "../types";
import type { PriceFetcher } from "../clients/price-fetcher";
import { FetcherRouter } from "../clients/fetcher-router";

interface HistoryAndNameFetcher {
  fetchHistory(
    symbol: string,
    startDate: string,
    endDate: string,
  ): Promise<Array<{ date: string; close: number }>>;
  fetchName(symbol: string): Promise<string | null>;
}

export async function getLatestPrice(db: D1Database, symbol: string): Promise<number | null> {
  const row = await db
    .prepare("SELECT close FROM price_history WHERE symbol = ? ORDER BY date DESC LIMIT 1")
    .bind(symbol)
    .first<{ close: number }>();
  return row?.close ?? null;
}

export async function syncPriceHistory(
  db: D1Database,
  fetcher: HistoryAndNameFetcher,
  symbol: string,
  startDate: string = "2026-01-01",
): Promise<number> {
  const today = new Date().toISOString().split("T")[0]!;

  // Find latest date for this symbol
  const latest = await db
    .prepare("SELECT MAX(date) as max_date FROM price_history WHERE symbol = ?")
    .bind(symbol)
    .first<{ max_date: string | null }>();

  const fetchStart = latest?.max_date
    ? new Date(new Date(latest.max_date).getTime() + 86400000).toISOString().split("T")[0]!
    : startDate;

  if (fetchStart > today) return 0;

  const history = await fetcher.fetchHistory(symbol, fetchStart, today);
  if (history.length === 0) return 0;

  for (const { date, close } of history) {
    await db
      .prepare(
        "INSERT INTO price_history (symbol, date, close) VALUES (?, ?, ?) ON CONFLICT(symbol, date) DO UPDATE SET close = excluded.close",
      )
      .bind(symbol, date, close)
      .run();
  }

  // Fetch and store stock name
  const name = await fetcher.fetchName(symbol);
  if (name) {
    await db
      .prepare(
        "INSERT INTO stocks (symbol, name) VALUES (?, ?) ON CONFLICT(symbol) DO UPDATE SET name = excluded.name",
      )
      .bind(symbol, name)
      .run();
  }

  return history.length;
}

const prices = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>();

prices.post("/sync", async (c) => {
  const body = (await c.req.json<{ symbol?: string; start_date?: string }>().catch(() => ({
    symbol: undefined,
    start_date: undefined,
  }))) as { symbol?: string; start_date?: string };
  const startDate = body.start_date ?? "2026-01-01";

  const apiKey = c.env.FINNHUB_API_KEY;
  if (!apiKey) {
    return c.json({ error: "FINNHUB_API_KEY not configured" }, 500);
  }

  const finnhub: PriceFetcher = {
    async fetchPrice(symbol: string) {
      const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}`, {
        headers: { "X-Finnhub-Token": apiKey },
      });
      if (res.ok) {
        const body = (await res.json()) as { c: number };
        if (typeof body.c === "number" && body.c >= 0) return body.c;
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

  const symbols = body.symbol
    ? [body.symbol]
    : (
        await c.env.DB.prepare(
          "SELECT DISTINCT symbol FROM transactions WHERE type IN ('buy', 'sell', 'initial')",
        ).all<{
          symbol: string;
        }>()
      ).results.map((r) => r.symbol);

  let totalRecords = 0;
  const results: Array<{ symbol: string; records: number }> = [];

  for (const symbol of symbols) {
    const records = await syncPriceHistory(c.env.DB, fetcher, symbol, startDate);
    totalRecords += records;
    results.push({ symbol, records });
  }

  return c.json({ data: { total_records: totalRecords, results } });
});

prices.get("/history/:symbol", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const symbol = c.req.param("symbol")?.toUpperCase();
  if (!symbol) return c.json({ error: "Symbol is required" }, 400);

  const { start_date, end_date } = c.req.query();

  let sql = "SELECT date, close FROM price_history WHERE symbol = ?";
  const params: (string | number)[] = [symbol];

  if (start_date) {
    sql += " AND date >= ?";
    params.push(start_date);
  }
  if (end_date) {
    sql += " AND date <= ?";
    params.push(end_date);
  }
  sql += " ORDER BY date ASC";

  const rows = await c.env.DB.prepare(sql)
    .bind(...params)
    .all<{ date: string; close: number }>();

  return c.json({
    data: {
      symbol,
      prices: rows.results,
    },
  });
});

export default prices;
