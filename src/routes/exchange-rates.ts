import { Hono } from "hono";
import type { AuthVariables } from "../middleware/auth";
import type { Bindings } from "../types";
import type { ExchangeRateRecord } from "../../shared/types/api";

const PAIRS: Array<{ from: string; to: string }> = [
  { from: "USD", to: "CNY" },
  { from: "USD", to: "HKD" },
];

async function fetchHistory(
  from: string,
  to: string,
  startDate: string,
  endDate: string,
): Promise<Array<{ date: string; rate: number }>> {
  const period1 = Math.floor(new Date(startDate).getTime() / 1000);
  const period2 = Math.floor(new Date(endDate).getTime() / 1000);
  const symbol = `${from}${to}=X`;

  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&period1=${period1}&period2=${period2}`,
      {
        headers: { "User-Agent": "Mozilla/5.0" },
      },
    );
    if (!res.ok) return [];

    const body = (await res.json()) as {
      chart?: {
        result?: Array<{
          timestamp?: number[];
          indicators?: {
            quote?: Array<{ close?: number[] }>;
          };
        }>;
      };
    };

    const result = body.chart?.result?.[0];
    if (!result?.timestamp || !result?.indicators?.quote?.[0]?.close) return [];

    const closes = result.indicators.quote[0].close;
    const history: Array<{ date: string; rate: number }> = [];

    for (let i = 0; i < result.timestamp.length; i++) {
      const close = closes[i];
      const ts = result.timestamp[i];
      if (typeof close === "number" && close > 0 && ts !== undefined) {
        const date = new Date(ts * 1000).toISOString().split("T")[0]!;
        history.push({ date, rate: close });
      }
    }

    return history;
  } catch {
    return [];
  }
}

/**
 * Sync exchange rates for all currency pairs.
 * Called by cron and by POST /sync route.
 * Fetches the last 7 days of exchange rate data to catch any missing dates.
 */
export async function syncExchangeRates(db: D1Database): Promise<number> {
  const today = new Date().toISOString().split("T")[0]!;
  const past = new Date();
  past.setDate(past.getDate() - 7);
  const startDate = past.toISOString().split("T")[0]!;

  let count = 0;

  for (const { from, to } of PAIRS) {
    const history = await fetchHistory(from, to, startDate, today);
    for (const { date, rate } of history) {
      const insert = await db
        .prepare(
          "INSERT OR IGNORE INTO exchange_rates (from_currency, to_currency, date, rate) VALUES (?, ?, ?, ?)",
        )
        .bind(from, to, date, Math.round(rate * 1000000) / 1000000)
        .run();
      if (insert.meta.changes > 0) count++;
    }
  }

  return count;
}

const exchangeRates = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>();

exchangeRates.get("/", async (c) => {
  const from = c.req.query("from");
  const to = c.req.query("to");
  const startDate = c.req.query("start_date");
  const endDate = c.req.query("end_date");

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (from) {
    conditions.push("from_currency = ?");
    params.push(from);
  }
  if (to) {
    conditions.push("to_currency = ?");
    params.push(to);
  }
  if (startDate) {
    conditions.push("date >= ?");
    params.push(startDate);
  }
  if (endDate) {
    conditions.push("date <= ?");
    params.push(endDate);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const sql = `SELECT id, from_currency, to_currency, date, rate, created_at FROM exchange_rates ${where} ORDER BY date DESC, from_currency, to_currency LIMIT 100`;

  let stmt = c.env.DB.prepare(sql);
  if (params.length > 0) {
    stmt = stmt.bind(...params);
  }
  const rows = await stmt.all<ExchangeRateRecord>();

  return c.json({ data: rows.results });
});

exchangeRates.post("/sync", async (c) => {
  const body = await c.req
    .json<{ start_date?: string; end_date?: string }>()
    .catch(() => ({ start_date: undefined, end_date: undefined }));

  const db = c.env.DB;

  if (body.start_date && body.end_date) {
    let count = 0;
    for (const { from, to } of PAIRS) {
      const history = await fetchHistory(from, to, body.start_date, body.end_date);
      for (const { date, rate } of history) {
        const insert = await db
          .prepare(
            "INSERT OR IGNORE INTO exchange_rates (from_currency, to_currency, date, rate) VALUES (?, ?, ?, ?)",
          )
          .bind(from, to, date, Math.round(rate * 1000000) / 1000000)
          .run();
        if (insert.meta.changes > 0) count++;
      }
    }
    return c.json({ data: { records_synced: count } });
  }

  const count = await syncExchangeRates(db);
  return c.json({ data: { records_synced: count } });
});

exchangeRates.post("/bulk", async (c) => {
  const body = await c.req.json<{
    rates: Array<{
      from_currency: string;
      to_currency: string;
      date: string;
      rate: number;
    }>;
  }>();

  if (!Array.isArray(body.rates)) {
    return c.json({ error: "rates array is required" }, 400);
  }

  const db = c.env.DB;
  let count = 0;

  for (const r of body.rates) {
    if (!r.from_currency || !r.to_currency || !r.date || typeof r.rate !== "number") continue;
    try {
      const insert = await db
        .prepare(
          "INSERT OR IGNORE INTO exchange_rates (from_currency, to_currency, date, rate) VALUES (?, ?, ?, ?)",
        )
        .bind(r.from_currency, r.to_currency, r.date, Math.round(r.rate * 1000000) / 1000000)
        .run();
      if (insert.meta.changes > 0) count++;
    } catch {
      // Skip invalid rows
    }
  }

  return c.json({ data: { records_synced: count } });
});

export default exchangeRates;
