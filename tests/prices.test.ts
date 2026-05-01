import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPlatformProxy, unstable_dev } from "wrangler";
import type { UnstableDevWorker } from "wrangler";
import { cleanDatabase, createApiTokenForUser } from "./helpers";
import { FakePriceFetcher } from "./fake-price-fetcher";
import { updatePrices } from "../src/routes/prices";

let worker: UnstableDevWorker;
let db: D1Database;
let portfolioId: number;
let authToken: string;

beforeAll(async () => {
  const { env } = await getPlatformProxy<{ DB: D1Database }>();
  db = env.DB;
  worker = await unstable_dev("src/index.ts", {
    config: "wrangler.toml",
    local: true,
  });
});

afterAll(async () => {
  await worker.stop();
});

beforeEach(async () => {
  await cleanDatabase(db);
  const userResult = await db
    .prepare("INSERT INTO users (email) VALUES (?) RETURNING id")
    .bind("test@example.com")
    .first<{ id: number }>();
  authToken = await createApiTokenForUser(db, userResult!.id);
  const portfolioResult = await db
    .prepare("INSERT INTO portfolios (user_id, name, currency) VALUES (?, ?, ?) RETURNING id")
    .bind(userResult!.id, "US Stocks", "USD")
    .first<{ id: number }>();
  portfolioId = portfolioResult!.id;
});

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${authToken}` };
}

async function seedLot(symbol: string) {
  const txResult = await db
    .prepare(
      "INSERT INTO transactions (portfolio_id, symbol, type, quantity, price, fee, date) VALUES (?, ?, 'buy', 100, 150, 0, '2024-01-01')",
    )
    .bind(portfolioId, symbol)
    .run();
  await db
    .prepare(
      "INSERT INTO lots (transaction_id, portfolio_id, symbol, quantity, remaining_quantity, cost_basis) VALUES (?, ?, ?, 100, 100, 15000)",
    )
    .bind(txResult.meta.last_row_id, portfolioId, symbol)
    .run();
}

describe("Price Update", () => {
  it("[UC-PORTFOLIO-005-S01] updates prices for held stocks", async () => {
    await seedLot("AAPL");
    await seedLot("TSLA");

    const fetcher = new FakePriceFetcher();
    fetcher.setPrice("AAPL", 180);
    fetcher.setPrice("TSLA", 250);

    const updated = await updatePrices(db, fetcher);
    expect(updated).toBe(2);

    const aapl = await db
      .prepare("SELECT price FROM prices WHERE symbol = ?")
      .bind("AAPL")
      .first<{ price: number }>();
    expect(aapl!.price).toBe(180);
    const tsla = await db
      .prepare("SELECT price FROM prices WHERE symbol = ?")
      .bind("TSLA")
      .first<{ price: number }>();
    expect(tsla!.price).toBe(250);
  });

  it("[UC-PORTFOLIO-005-S02] stores price and timestamp", async () => {
    await seedLot("AAPL");

    const fetcher = new FakePriceFetcher();
    fetcher.setPrice("AAPL", 175.5);

    const updated = await updatePrices(db, fetcher);
    expect(updated).toBe(1);

    const row = await db
      .prepare("SELECT price, updated_at FROM prices WHERE symbol = ?")
      .bind("AAPL")
      .first<{ price: number; updated_at: string }>();
    expect(row!.price).toBe(175.5);
    expect(row!.updated_at).not.toBeNull();
  });

  it("[UC-PORTFOLIO-005-S03] continues on individual fetch failure", async () => {
    await seedLot("AAPL");
    await seedLot("TSLA");

    const fetcher = new FakePriceFetcher();
    fetcher.setPrice("AAPL", 180);
    fetcher.setFailure("TSLA");

    const updated = await updatePrices(db, fetcher);
    expect(updated).toBe(1);

    const aapl = await db
      .prepare("SELECT price FROM prices WHERE symbol = ?")
      .bind("AAPL")
      .first<{ price: number }>();
    expect(aapl!.price).toBe(180);
    const tsla = await db.prepare("SELECT price FROM prices WHERE symbol = ?").bind("TSLA").first();
    expect(tsla).toBeNull();
  });

  it("[UC-PORTFOLIO-005-S04] returns 0 when no holdings", async () => {
    const fetcher = new FakePriceFetcher();
    const updated = await updatePrices(db, fetcher);
    expect(updated).toBe(0);
  });

  it("[UC-PORTFOLIO-005-S05] returns 401 when unauthenticated", async () => {
    const res = await worker.fetch("http://localhost/api/prices/update", {
      method: "POST",
    });
    expect(res.status).toBe(401);
  });

  it("HTTP endpoint returns updated count", async () => {
    const res = await worker.fetch("http://localhost/api/prices/update", {
      method: "POST",
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { updated: number } };
    expect(body.data.updated).toBe(0);
  });
});
