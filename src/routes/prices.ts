import { Hono } from "hono";
import type { AuthVariables } from "../middleware/auth";
import type { Bindings } from "../types";
import type { PriceFetcher } from "../clients/price-fetcher";

export async function updatePrices(db: D1Database, fetcher: PriceFetcher): Promise<number> {
  const symbols = await db
    .prepare("SELECT DISTINCT symbol FROM lots WHERE closed = 0")
    .all<{ symbol: string }>();

  if (symbols.results.length === 0) return 0;

  let updated = 0;
  for (const { symbol } of symbols.results) {
    let price: number | null = null;
    try {
      price = await fetcher.fetchPrice(symbol);
    } catch {
      // individual symbol failure doesn't stop others
    }

    if (price !== null) {
      await db
        .prepare(
          "INSERT INTO prices (symbol, price, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(symbol) DO UPDATE SET price = excluded.price, updated_at = excluded.updated_at",
        )
        .bind(symbol, price)
        .run();
      updated++;
    }
  }

  return updated;
}

const prices = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>();

prices.post("/update", async (c) => {
  const fetcher: PriceFetcher = {
    async fetchPrice(symbol: string) {
      const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}`, {
        headers: { "X-Finnhub-Token": "sandbox" },
      });
      if (res.ok) {
        const body = (await res.json()) as { c: number };
        if (typeof body.c === "number" && body.c > 0) return body.c;
      }
      return null;
    },
  };

  const updated = await updatePrices(c.env.DB, fetcher);
  return c.json({ data: { updated } });
});

export default prices;
