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
  worker = await unstable_dev("src/index.ts", { config: "wrangler.toml", local: true });
});

afterAll(async () => await worker.stop());

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

describe("Corporate Actions", () => {
  it("[UC-PORTFOLIO-010-S01] processes stock split updating lot quantities", async () => {
    const txRes = await db
      .prepare(
        "INSERT INTO transactions (portfolio_id, symbol, type, quantity, price, fee, date) VALUES (?, 'AAPL', 'buy', 100, 150, 5, '2024-01-01')",
      )
      .bind(portfolioId)
      .run();
    await db
      .prepare(
        "INSERT INTO lots (transaction_id, portfolio_id, symbol, quantity, remaining_quantity, cost_basis) VALUES (?, ?, 'AAPL', 100, 100, 15005)",
      )
      .bind(txRes.meta.last_row_id, portfolioId)
      .run();

    const res = await worker.fetch(
      `http://localhost/api/portfolios/${portfolioId}/corporate-actions`,
      {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: "AAPL",
          type: "split",
          ratio: 4,
          effective_date: "2024-06-01",
        }),
      },
    );
    expect(res.status).toBe(201);

    const lot = await db
      .prepare("SELECT quantity, remaining_quantity, cost_basis FROM lots WHERE symbol = 'AAPL'")
      .first<{ quantity: number; remaining_quantity: number; cost_basis: number }>();
    expect(lot!.quantity).toBe(400);
    expect(lot!.remaining_quantity).toBe(400);
    expect(lot!.cost_basis).toBe(15005);
  });

  it("[UC-PORTFOLIO-010-S02] only affects open lots", async () => {
    const txRes = await db
      .prepare(
        "INSERT INTO transactions (portfolio_id, symbol, type, quantity, price, fee, date) VALUES (?, 'AAPL', 'buy', 100, 150, 5, '2024-01-01')",
      )
      .bind(portfolioId)
      .run();
    await db
      .prepare(
        "INSERT INTO lots (transaction_id, portfolio_id, symbol, quantity, remaining_quantity, cost_basis) VALUES (?, ?, 'AAPL', 100, 0, 15005)",
      )
      .bind(txRes.meta.last_row_id, portfolioId)
      .run();

    const res = await worker.fetch(
      `http://localhost/api/portfolios/${portfolioId}/corporate-actions`,
      {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: "AAPL",
          type: "split",
          ratio: 4,
          effective_date: "2024-06-01",
        }),
      },
    );
    expect(res.status).toBe(201);

    const lot = await db
      .prepare("SELECT quantity FROM lots WHERE symbol = 'AAPL'")
      .first<{ quantity: number }>();
    expect(lot!.quantity).toBe(100);
  });
});
