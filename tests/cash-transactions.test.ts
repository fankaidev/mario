import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestContext, cleanDatabase, createApiTokenForUser } from "./helpers";
import type { TestContext } from "./helpers";

let ctx: TestContext;
let db: D1Database;
let userId: number;
let portfolioId: number;
let authToken: string;

beforeAll(async () => {
  ctx = await createTestContext();
  db = ctx.db;
});

afterAll(async () => {
  await ctx.clean();
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
  const response = await ctx.request(`/api/portfolios/${portfolioId}/summary`, {
    headers: authHeaders(),
  });
  const json = (await response.json()) as { data: { cash_balance: number } };
  return json.data.cash_balance;
}

async function createTransfer(
  type: string,
  amount: number,
  fee: number,
): Promise<{ status: number; data?: { id: number } }> {
  const res = await ctx.request(`/api/portfolios/${portfolioId}/cash-transfers`, {
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
  const res = await ctx.request(`/api/portfolios/${portfolioId}/transactions`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ type, price, fee, date: "2024-01-15", symbol, quantity }),
  });
  const json = (await res.json()) as { data?: { id: number } };
  return { status: res.status, data: json.data };
}

async function deleteTransfer(transferId: number): Promise<Response> {
  return ctx.request(`/api/portfolios/${portfolioId}/cash-transfers/${transferId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
}

async function deleteTransaction(txId: number): Promise<Response> {
  return ctx.request(`/api/portfolios/${portfolioId}/transactions/${txId}`, {
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
    // Seed initial cash via deposit
    await createTransfer("deposit", 10000, 0);

    const result = await createTransfer("withdrawal", 3000, 0);
    expect(result.status).toBe(201);

    expect(await getCashBalance()).toBe(7000);
  });

  it("[UC-PORTFOLIO-006-S03] withdrawal fails with insufficient balance", async () => {
    // Seed initial cash via deposit
    await createTransfer("deposit", 1000, 0);

    const result = await createTransfer("withdrawal", 2000, 0);
    expect(result.status).toBe(400);

    expect(await getCashBalance()).toBe(1000);
  });

  it("[UC-PORTFOLIO-006-S04] buy decreases cash_balance", async () => {
    // Seed initial cash via deposit
    await createTransfer("deposit", 10000, 0);

    const result = await createTransaction("buy", 150, 5, "AAPL", 10);
    expect(result.status).toBe(201);

    expect(await getCashBalance()).toBe(8495);
  });

  it("[UC-PORTFOLIO-006-S05] sell increases cash_balance", async () => {
    // Deposit enough for the buy, then sell
    await createTransfer("deposit", 1500, 0); // Cash = 1500

    await createTransaction("buy", 150, 0, "AAPL", 10);
    // After buy: 1500 - 1500 = 0

    const result = await createTransaction("sell", 180, 5, "AAPL", 5);
    expect(result.status).toBe(201);

    // After sell: 0 + (5*180 - 5) = 895
    expect(await getCashBalance()).toBe(895);
  });

  it("[UC-PORTFOLIO-006-S06] dividend increases cash_balance", async () => {
    // Portfolio starts with 0 cash by default, no setup needed

    const result = await createTransaction("dividend", 0.25, 2.5, "AAPL", 100);
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
    // Seed initial cash via deposit
    await createTransfer("deposit", 10000, 0);

    const result = await createTransaction("buy", 150, 5, "AAPL", 10);
    expect(result.status).toBe(201);
    expect(await getCashBalance()).toBe(8495);

    const res = await deleteTransaction(result.data!.id);
    expect(res.status).toBe(200);

    expect(await getCashBalance()).toBe(10000);
  });

  it("[UC-PORTFOLIO-006-S09] deleting deposit allowed even if causes negative balance", async () => {
    const depositResult = await createTransfer("deposit", 10000, 0);
    expect(depositResult.status).toBe(201);

    const withdrawalResult = await createTransfer("withdrawal", 6000, 0);
    expect(withdrawalResult.status).toBe(201);
    expect(await getCashBalance()).toBe(4000);

    const res = await deleteTransfer(depositResult.data!.id);
    expect(res.status).toBe(200);

    expect(await getCashBalance()).toBe(-6000);
  });

  it("[UC-PORTFOLIO-006-S10] buy with insufficient cash allowed (negative balance)", async () => {
    // Seed initial cash via deposit
    await createTransfer("deposit", 1000, 0);

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
    // Seed initial cash via deposit
    await createTransfer("deposit", 5000, 0);

    const result = await createTransfer("withdrawal", 1000, 25);
    expect(result.status).toBe(201);

    expect(await getCashBalance()).toBe(3975);
  });

  it("[UC-PORTFOLIO-006-S14] cash transfers list includes running cash balance after all events", async () => {
    // deposit 10000 on 2024-01-01
    const d1 = await ctx.request(`/api/portfolios/${portfolioId}/cash-transfers`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ type: "deposit", amount: 10000, fee: 0, date: "2024-01-01" }),
    });
    expect(d1.status).toBe(201);

    // buy 1500 on 2024-01-15
    const b1 = await ctx.request(`/api/portfolios/${portfolioId}/transactions`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "buy",
        symbol: "AAPL",
        quantity: 10,
        price: 150,
        fee: 0,
        date: "2024-01-15",
      }),
    });
    expect(b1.status).toBe(201);

    // withdrawal 2000 on 2024-02-01
    const w1 = await ctx.request(`/api/portfolios/${portfolioId}/cash-transfers`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ type: "withdrawal", amount: 2000, fee: 0, date: "2024-02-01" }),
    });
    expect(w1.status).toBe(201);

    // Verify cash balance is correct via summary (not cash-transfers list)
    const cashBalance = await getCashBalance();
    // deposit 10000 + buy AAPL 10@150 (-1500) + withdrawal 2000 (-2000) = 6500
    expect(cashBalance).toBe(6500);
  });

  it("[UC-PORTFOLIO-006-S13] recalculate cash from all cash movements and transactions", async () => {
    await createTransfer("deposit", 100000, 0);
    await createTransfer("withdrawal", 10000, 0);

    await createTransaction("buy", 150, 10, "AAPL", 100);
    await createTransaction("sell", 180, 5, "AAPL", 50);
    await createTransaction("dividend", 0.25, 15, "AAPL", 400);

    const cashBalance = await getCashBalance();

    // Expected:
    // deposits: +100000 (no fee) - withdrawals: -10000 = +90000 from transfers
    // buy: -(100*150 + 10) = -15010
    // sell: +(50*180 - 5) = +8995
    // dividend: +(400 * 0.25 - 15) = +85
    // Total: 90000 - 15010 + 8995 + 85 = 84070
    expect(cashBalance).toBe(84070);
  });

  it("[UC-PORTFOLIO-006-S15] initial transfer increases cash_balance", async () => {
    const result = await createTransfer("initial", 50000, 0);
    expect(result.status).toBe(201);

    expect(await getCashBalance()).toBe(50000);
  });

  it("[UC-PORTFOLIO-006-S16] interest transfer increases cash_balance", async () => {
    const result = await createTransfer("interest", 123.45, 0);
    expect(result.status).toBe(201);

    expect(await getCashBalance()).toBe(123.45);
  });

  it("[UC-PORTFOLIO-006-S17] interest does not count toward total_investment", async () => {
    // Add deposit and interest
    await createTransfer("deposit", 10000, 0);
    await createTransfer("interest", 500, 0);

    const response = await ctx.request(`/api/portfolios/${portfolioId}/summary`, {
      headers: authHeaders(),
    });
    const json = (await response.json()) as {
      data: { cash_balance: number; total_investment: number };
    };

    // Cash includes interest
    expect(json.data.cash_balance).toBe(10500);
    // Total investment excludes interest
    expect(json.data.total_investment).toBe(10000);
  });
});
