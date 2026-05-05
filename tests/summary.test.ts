import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestContext, cleanDatabase, createApiTokenForUser } from "./helpers";
import type { TestContext } from "./helpers";
import type { PortfolioSummary } from "../shared/types/api";

let ctx: TestContext;
let db: D1Database;
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

async function makeDeposit(amount: number) {
  const res = await ctx.request(`/api/portfolios/${portfolioId}/cash-transfers`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ type: "deposit", amount, fee: 0, date: "2024-01-01" }),
  });
  return (await res.json()) as { data: { id: number } };
}

async function makeWithdrawal(amount: number) {
  const res = await ctx.request(`/api/portfolios/${portfolioId}/cash-transfers`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ type: "withdrawal", amount, fee: 0, date: "2024-01-01" }),
  });
  return (await res.json()) as { data: { id: number } };
}

async function makeBuy(symbol: string, quantity: number, price: number, fee: number) {
  const res = await ctx.request(`/api/portfolios/${portfolioId}/transactions`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ symbol, type: "buy", quantity, price, fee, date: "2024-01-01" }),
  });
  return (await res.json()) as { data: { id: number } };
}

async function makeSell(symbol: string, quantity: number, price: number, fee: number) {
  const res = await ctx.request(`/api/portfolios/${portfolioId}/transactions`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ symbol, type: "sell", quantity, price, fee, date: "2024-02-01" }),
  });
  return (await res.json()) as { data: { id: number } };
}

async function getSummary() {
  const res = await ctx.request(`/api/portfolios/${portfolioId}/summary`, {
    headers: authHeaders(),
  });
  return (await res.json()) as {
    data: PortfolioSummary;
  };
}

describe("Portfolio Summary", () => {
  it("[UC-PORTFOLIO-006-S01] calculates all metrics correctly", async () => {
    await makeDeposit(20000);
    await makeBuy("AAPL", 100, 150, 5);
    await makeBuy("TSLA", 50, 100, 3);
    await db
      .prepare(
        "INSERT INTO price_history (symbol, date, close) VALUES ('AAPL', '2024-03-01', 180), ('TSLA', '2024-03-01', 90)",
      )
      .run();

    const { data } = await getSummary();
    expect(data.total_investment).toBe(20000);
    expect(data.securities_value).toBe(18000 + 4500);
    expect(data.unrealized_pnl).toBeCloseTo(2492, 0);
    expect(data.realized_pnl).toBe(0);
    expect(data.total_pnl).toBeCloseTo(2492, 0);
    expect(data.return_rate).toBeGreaterThan(0); // IRR-based, positive return
  });

  it("[UC-PORTFOLIO-006-S02] includes realized P&L from sells", async () => {
    await makeDeposit(25000);
    await makeBuy("MSFT", 100, 200, 5);
    await makeSell("MSFT", 50, 220, 5);
    await db
      .prepare("INSERT INTO price_history (symbol, date, close) VALUES ('MSFT', '2024-03-01', 220)")
      .run();

    const { data } = await getSummary();
    expect(data.total_investment).toBe(25000);
    expect(data.realized_pnl).toBeGreaterThan(0);
  });

  it("[UC-PORTFOLIO-006-S03] includes dividend income", async () => {
    await db
      .prepare(
        "INSERT INTO transactions (portfolio_id, symbol, type, quantity, price, fee, date) VALUES (?, 'AAPL', 'dividend', 400, 0.25, 30, '2024-04-01')",
      )
      .bind(portfolioId)
      .run();

    const { data } = await getSummary();
    expect(data.dividend_income).toBe(70);
    expect(data.cumulative_withholding_tax).toBe(30);
  });

  it("[UC-PORTFOLIO-006-S05] returns zero metrics when empty", async () => {
    const { data } = await getSummary();
    expect(data.total_investment).toBe(0);
    expect(data.securities_value).toBe(0);
    expect(data.unrealized_pnl).toBe(0);
    expect(data.realized_pnl).toBe(0);
    expect(data.dividend_income).toBe(0);
    expect(data.total_pnl).toBe(0);
  });

  it("[UC-PORTFOLIO-006-S06] calculates total_investment from deposits minus withdrawals", async () => {
    await makeDeposit(50000);
    await makeDeposit(20000);
    await makeWithdrawal(10000);

    const { data } = await getSummary();
    expect(data.total_investment).toBe(60000);
  });

  it("[UC-PORTFOLIO-006-S09] includes cash balance in portfolio value", async () => {
    // Deposit enough to have 198000 cash after buying AAPL (15005) and TSLA (5003)
    // 198000 + 15005 + 5003 = 218008
    await makeDeposit(218008);
    await makeBuy("AAPL", 100, 150, 5);
    await makeBuy("TSLA", 50, 100, 3);
    await db
      .prepare(
        "INSERT INTO price_history (symbol, date, close) VALUES ('AAPL', '2024-03-01', 180), ('TSLA', '2024-03-01', 90)",
      )
      .run();

    const { data } = await getSummary();
    expect(data.securities_value).toBe(22500);
    expect(data.cash_balance).toBe(198000);
    expect(data.portfolio_value).toBe(220500);
  });

  it("[UC-PORTFOLIO-006-S10] returns price_updated_at as oldest latest date among held symbols", async () => {
    await makeDeposit(20000);
    await makeBuy("AAPL", 100, 150, 5);
    await makeBuy("TSLA", 50, 100, 3);
    await db
      .prepare(
        "INSERT INTO price_history (symbol, date, close) VALUES ('AAPL', '2024-03-01', 180), ('TSLA', '2024-03-02', 90)",
      )
      .run();

    const { data } = await getSummary();
    expect(data.price_updated_at).toBe("2024-03-01");
  });

  it("[UC-PORTFOLIO-006-S10b] returns null price_updated_at when no holdings", async () => {
    await makeDeposit(20000);

    const { data } = await getSummary();
    expect(data.price_updated_at).toBeNull();
  });
});
