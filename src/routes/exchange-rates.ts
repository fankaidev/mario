import { Hono } from "hono";
import type { AuthVariables } from "../middleware/auth";
import type { Bindings } from "../types";
import type { ExchangeRateRecord } from "../../shared/types/api";

const PAIRS: Array<{ from: string; to: string }> = [
  { from: "CNY", to: "USD" },
  { from: "HKD", to: "USD" },
];

async function fetchRate(
  from: string,
  to: string,
  date?: string,
): Promise<{ date: string; rate: number } | null> {
  const baseUrl = "https://api.frankfurter.app";
  const url = date
    ? `${baseUrl}/${date}?from=${from}&to=${to}`
    : `${baseUrl}/latest?from=${from}&to=${to}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const body = (await res.json()) as {
      date: string;
      rates: Record<string, number>;
    };
    const rate = body.rates[to];
    if (typeof rate !== "number" || rate <= 0) return null;
    return { date: body.date, rate };
  } catch {
    return null;
  }
}

/**
 * Sync exchange rates for all currency pairs.
 * Called by cron and by POST /sync route.
 * Returns the number of new records inserted.
 */
export async function syncExchangeRates(db: D1Database): Promise<number> {
  let count = 0;

  for (const { from, to } of PAIRS) {
    const result = await fetchRate(from, to);
    if (!result) continue;

    const insert = await db
      .prepare(
        "INSERT OR IGNORE INTO exchange_rates (from_currency, to_currency, date, rate) VALUES (?, ?, ?, ?)",
      )
      .bind(from, to, result.date, Math.round(result.rate * 1000000) / 1000000)
      .run();

    if (insert.meta.changes > 0) {
      count++;
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
    const start = new Date(body.start_date);
    const end = new Date(body.end_date);

    for (const { from, to } of PAIRS) {
      const current = new Date(start);
      while (current <= end) {
        const dateStr = current.toISOString().split("T")[0]!;
        const result = await fetchRate(from, to, dateStr);
        if (result) {
          const insert = await db
            .prepare(
              "INSERT OR IGNORE INTO exchange_rates (from_currency, to_currency, date, rate) VALUES (?, ?, ?, ?)",
            )
            .bind(from, to, result.date, Math.round(result.rate * 1000000) / 1000000)
            .run();
          if (insert.meta.changes > 0) count++;
        }
        current.setDate(current.getDate() + 1);
      }
    }

    return c.json({ data: { records_synced: count } });
  }

  const count = await syncExchangeRates(db);
  return c.json({ data: { records_synced: count } });
});

export default exchangeRates;
