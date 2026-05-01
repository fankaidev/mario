import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPlatformProxy, unstable_dev } from "wrangler";
import type { UnstableDevWorker } from "wrangler";
import { cleanDatabase, createApiTokenForUser } from "./helpers";

let worker: UnstableDevWorker;
let db: D1Database;
let userId: number;
let portfolioId: number;
let authToken: string;

beforeAll(async () => {
  const { env } = await getPlatformProxy<{ DB: D1Database }>();
  db = env.DB;
  worker = await unstable_dev("src/index.ts", { config: "wrangler.toml", local: true });
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
  userId = userResult!.id;
  authToken = await createApiTokenForUser(db, userId);
  const portfolioResult = await db
    .prepare("INSERT INTO portfolios (user_id, name, currency) VALUES (?, ?, ?) RETURNING id")
    .bind(userId, "US Stocks", "USD")
    .first<{ id: number }>();
  portfolioId = portfolioResult!.id;
});

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${authToken}` };
}

async function getCashBalance(): Promise<number> {
  const portfolio = await db
    .prepare("SELECT cash_balance FROM portfolios WHERE id = ?")
    .bind(portfolioId)
    .first<{ cash_balance: number }>();
  return portfolio!.cash_balance;
}

async function createTransfer(
  type: string,
  amount: number,
  fee: number,
): Promise<{ status: number; data?: { id: number } }> {
  const res = await worker.fetch(`http://localhost/api/portfolios/${portfolioId}/transfers`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ type, amount, fee, date: "2024-01-15" }),
  });
  const json = (await res.json()) as { data?: { id: number } };
  return { status: res.status, data: json.data };
}

async function createTransaction(
  type: string,
  price: number,
  fee: number,
  symbol: string,
  quantity: number,
): Promise<{ status: number; data?: { id: number } }> {
  const res = await worker.fetch(`http://localhost/api/portfolios/${portfolioId}/transactions`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ type, price, fee, date: "2024-01-15", symbol, quantity }),
  });
  const json = (await res.json()) as { data?: { id: number } };
  return { status: res.status, data: json.data };
}

async function deleteTransfer(transferId: number): Promise<Response> {
  return worker.fetch(`http://localhost/api/portfolios/${portfolioId}/transfers/${transferId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
}

async function deleteTransaction(txId: number): Promise<Response> {
  return worker.fetch(`http://localhost/api/portfolios/${portfolioId}/transactions/${txId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
}

describe("Cash Transactions", () => {
  it("[UC-PORTFOLIO-006-S01] deposit increases cash_balance", async () => {
    expect(await getCashBalance()).toBe(0);

    const result = await createTransfer("deposit", 10000, 0);
    expect(result.status).toBe(201);

    expect(await getCashBalance()).toBe(10000);
  });

  it("[UC-PORTFOLIO-006-S02] withdrawal decreases cash_balance", async () => {
    await db
      .prepare("UPDATE portfolios SET cash_balance = 10000 WHERE id = ?")
      .bind(portfolioId)
      .run();

    const result = await createTransfer("withdrawal", 3000, 0);
    expect(result.status).toBe(201);

    expect(await getCashBalance()).toBe(7000);
  });

  it("[UC-PORTFOLIO-006-S03] withdrawal fails with insufficient balance", async () => {
    await db
      .prepare("UPDATE portfolios SET cash_balance = 1000 WHERE id = ?")
      .bind(portfolioId)
      .run();

    const result = await createTransfer("withdrawal", 2000, 0);
    expect(result.status).toBe(400);

    expect(await getCashBalance()).toBe(1000);
  });

  it("[UC-PORTFOLIO-006-S04] buy decreases cash_balance", async () => {
    await db
      .prepare("UPDATE portfolios SET cash_balance = 10000 WHERE id = ?")
      .bind(portfolioId)
      .run();

    const result = await createTransaction("buy", 150, 5, "AAPL", 10);
    expect(result.status).toBe(201);

    expect(await getCashBalance()).toBe(8495);
  });

  it("[UC-PORTFOLIO-006-S05] sell increases cash_balance", async () => {
    await db.prepare("UPDATE portfolios SET cash_balance = 0 WHERE id = ?").bind(portfolioId).run();

    const txResult = await db
      .prepare(
        "INSERT INTO transactions (portfolio_id, symbol, type, quantity, price, fee, date) VALUES (?, 'AAPL', 'buy', 10, 150, 0, '2024-01-01') RETURNING id",
      )
      .bind(portfolioId)
      .first<{ id: number }>();
    await db
      .prepare(
        "INSERT INTO lots (transaction_id, portfolio_id, symbol, quantity, remaining_quantity, cost_basis) VALUES (?, ?, 'AAPL', 10, 10, 1500)",
      )
      .bind(txResult!.id, portfolioId)
      .run();

    const result = await createTransaction("sell", 180, 5, "AAPL", 5);
    expect(result.status).toBe(201);

    expect(await getCashBalance()).toBe(895);
  });

  it("[UC-PORTFOLIO-006-S06] dividend increases cash_balance", async () => {
    await db.prepare("UPDATE portfolios SET cash_balance = 0 WHERE id = ?").bind(portfolioId).run();

    const result = await createTransaction("dividend", 25, 2.5, "AAPL", 0);
    expect(result.status).toBe(201);

    expect(await getCashBalance()).toBe(22.5);
  });

  it("[UC-PORTFOLIO-006-S07] deleting deposit reverses cash_balance", async () => {
    const result = await createTransfer("deposit", 5000, 0);
    expect(result.status).toBe(201);
    expect(await getCashBalance()).toBe(5000);

    const res = await deleteTransfer(result.data!.id);
    expect(res.status).toBe(200);

    expect(await getCashBalance()).toBe(0);
  });

  it("[UC-PORTFOLIO-006-S08] deleting buy reverses cash_balance", async () => {
    await db
      .prepare("UPDATE portfolios SET cash_balance = 10000 WHERE id = ?")
      .bind(portfolioId)
      .run();

    const result = await createTransaction("buy", 150, 5, "AAPL", 10);
    expect(result.status).toBe(201);
    expect(await getCashBalance()).toBe(8495);

    const res = await deleteTransaction(result.data!.id);
    expect(res.status).toBe(200);

    expect(await getCashBalance()).toBe(10000);
  });

  it("[UC-PORTFOLIO-006-S09] deleting deposit fails if would cause negative balance from withdrawals", async () => {
    const depositResult = await createTransfer("deposit", 10000, 0);
    expect(depositResult.status).toBe(201);

    const withdrawalResult = await createTransfer("withdrawal", 6000, 0);
    expect(withdrawalResult.status).toBe(201);
    expect(await getCashBalance()).toBe(4000);

    const res = await deleteTransfer(depositResult.data!.id);
    expect(res.status).toBe(400);

    expect(await getCashBalance()).toBe(4000);
  });

  it("[UC-PORTFOLIO-006-S10] buy with insufficient cash allowed (negative balance)", async () => {
    await db
      .prepare("UPDATE portfolios SET cash_balance = 1000 WHERE id = ?")
      .bind(portfolioId)
      .run();

    const result = await createTransaction("buy", 150, 0, "AAPL", 10);
    expect(result.status).toBe(201);

    expect(await getCashBalance()).toBe(-500);
  });

  it("[UC-PORTFOLIO-006-S11] deposit with fee deducts fee from credited amount", async () => {
    const result = await createTransfer("deposit", 10000, 50);
    expect(result.status).toBe(201);

    expect(await getCashBalance()).toBe(9950);
  });

  it("[UC-PORTFOLIO-006-S12] withdrawal with fee adds fee to deducted amount", async () => {
    await db
      .prepare("UPDATE portfolios SET cash_balance = 5000 WHERE id = ?")
      .bind(portfolioId)
      .run();

    const result = await createTransfer("withdrawal", 1000, 25);
    expect(result.status).toBe(201);

    expect(await getCashBalance()).toBe(3975);
  });
});
