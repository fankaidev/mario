import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPlatformProxy, unstable_dev } from "wrangler";
import type { UnstableDevWorker } from "wrangler";
import { cleanDatabase, createApiTokenForUser } from "./helpers";

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

async function seedLot(symbol: string, quantity: number, costBasis: number, remaining?: number) {
  const txResult = await db
    .prepare(
      "INSERT INTO transactions (portfolio_id, symbol, type, quantity, price, fee, date) VALUES (?, ?, 'buy', ?, ?, 0, '2024-01-01')",
    )
    .bind(portfolioId, symbol, quantity, costBasis / quantity)
    .run();
  return db
    .prepare(
      "INSERT INTO lots (transaction_id, portfolio_id, symbol, quantity, remaining_quantity, cost_basis) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(
      txResult.meta.last_row_id,
      portfolioId,
      symbol,
      quantity,
      remaining ?? quantity,
      costBasis,
    )
    .run();
}

describe("View Holdings", () => {
  it("[UC-PORTFOLIO-003-S01] calculates holdings with P&L correctly", async () => {
    await seedLot("AAPL", 100, 15000, 20);
    await seedLot("AAPL", 50, 8000, 50);
    await db
      .prepare("INSERT INTO prices (symbol, price, updated_at) VALUES (?, ?, ?)")
      .bind("AAPL", 180, "2024-03-01")
      .run();

    const res = await worker.fetch(`http://localhost/api/portfolios/${portfolioId}/holdings`, {
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: Array<{
        symbol: string;
        quantity: number;
        cost: number;
        market_value: number;
        unrealized_pnl: number;
        unrealized_pnl_rate: number;
      }>;
    };
    expect(body.data).toHaveLength(1);
    expect(body.data[0].symbol).toBe("AAPL");
    expect(body.data[0].quantity).toBe(70);
    expect(body.data[0].cost).toBe(11000);
    expect(body.data[0].market_value).toBe(12600);
    expect(body.data[0].unrealized_pnl).toBe(1600);
    expect(body.data[0].unrealized_pnl_rate).toBe(14.55);
  });

  it("[UC-PORTFOLIO-003-S02] returns empty when all lots closed", async () => {
    await seedLot("AAPL", 100, 15000, 0);
    await db.prepare("UPDATE lots SET closed = 1 WHERE remaining_quantity = 0").run();

    const res = await worker.fetch(`http://localhost/api/portfolios/${portfolioId}/holdings`, {
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: unknown[] };
    expect(body.data).toHaveLength(0);
  });

  it("[UC-PORTFOLIO-003-S03] shows null P&L when price missing", async () => {
    await seedLot("AAPL", 100, 15000, 100);

    const res = await worker.fetch(`http://localhost/api/portfolios/${portfolioId}/holdings`, {
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: Array<{
        price: number | null;
        market_value: number | null;
        unrealized_pnl: number | null;
      }>;
    };
    expect(body.data[0].price).toBeNull();
    expect(body.data[0].market_value).toBeNull();
    expect(body.data[0].unrealized_pnl).toBeNull();
  });

  it("[UC-PORTFOLIO-003-S04] returns 401 when not authenticated", async () => {
    const res = await worker.fetch(`http://localhost/api/portfolios/${portfolioId}/holdings`);
    expect(res.status).toBe(401);
  });
});
