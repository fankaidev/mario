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

async function makeBuy(symbol: string, quantity: number, price: number, fee: number = 0) {
  const res = await worker.fetch(`http://localhost/api/portfolios/${portfolioId}/transactions`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ symbol, type: "buy", quantity, price, fee, date: "2024-01-01" }),
  });
  return (await res.json()) as { data: { id: number } };
}

async function makeSell(symbol: string, quantity: number, price: number, fee: number = 0) {
  const res = await worker.fetch(`http://localhost/api/portfolios/${portfolioId}/transactions`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ symbol, type: "sell", quantity, price, fee, date: "2024-01-02" }),
  });
  return (await res.json()) as { data: { id: number } };
}

describe("View Holdings", () => {
  it("[UC-PORTFOLIO-003-S01] calculates holdings with P&L correctly", async () => {
    // Buy 100 @ 150 = 15000, cost_basis per share = 150
    await makeBuy("AAPL", 100, 150, 0);
    // Sell 80 → remaining 20, cost = 20 * 150 = 3000
    await makeSell("AAPL", 80, 160, 0);
    // Buy 50 @ 150 = 7500
    await makeBuy("AAPL", 50, 150, 0);

    await db
      .prepare("INSERT INTO price_history (symbol, date, close) VALUES (?, ?, ?)")
      .bind("AAPL", "2024-03-01", 180)
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
    expect(body.data[0].quantity).toBe(70); // 20 + 50
    expect(body.data[0].cost).toBe(10500); // 3000 + 7500
    expect(body.data[0].market_value).toBe(12600); // 70 * 180
    expect(body.data[0].unrealized_pnl).toBe(2100);
    expect(body.data[0].unrealized_pnl_rate).toBe(20);
  });

  it("[UC-PORTFOLIO-003-S02] returns empty when all lots closed", async () => {
    await makeBuy("AAPL", 100, 150, 0);
    await makeSell("AAPL", 100, 160, 0);

    const res = await worker.fetch(`http://localhost/api/portfolios/${portfolioId}/holdings`, {
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: unknown[] };
    expect(body.data).toHaveLength(0);
  });

  it("[UC-PORTFOLIO-003-S03] shows null P&L when price missing", async () => {
    await makeBuy("AAPL", 100, 150, 0);

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

  it("[UC-PORTFOLIO-003-S08] returns stock name from stocks table", async () => {
    await makeBuy("AAPL", 100, 150, 0);
    await db
      .prepare("INSERT INTO stocks (symbol, name) VALUES (?, ?)")
      .bind("AAPL", "Apple Inc")
      .run();

    const res = await worker.fetch(`http://localhost/api/portfolios/${portfolioId}/holdings`, {
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Array<{ symbol: string; name: string }> };
    expect(body.data[0].name).toBe("Apple Inc");
  });

  it("[UC-PORTFOLIO-003-S09] falls back to symbol when stocks table has no name", async () => {
    await makeBuy("AAPL", 100, 150, 0);

    const res = await worker.fetch(`http://localhost/api/portfolios/${portfolioId}/holdings`, {
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Array<{ symbol: string; name: string }> };
    expect(body.data[0].name).toBe("AAPL");
  });
});
