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

async function fetchCashMovements(): Promise<{
  status: number;
  data: Array<{
    id: number;
    date: string;
    type: string;
    symbol: string | null;
    note: string | null;
    amount: number;
    cash_balance: number;
  }>;
}> {
  const res = await ctx.request(`/api/portfolios/${portfolioId}/cash-movements`, {
    headers: authHeaders(),
  });
  const json = (await res.json()) as {
    data: Array<{
      id: number;
      date: string;
      type: string;
      symbol: string | null;
      note: string | null;
      amount: number;
      cash_balance: number;
    }>;
  };
  return { status: res.status, data: json.data };
}

async function createTransfer(
  type: string,
  amount: number,
  fee: number,
  date: string,
  note?: string,
) {
  const res = await ctx.request(`/api/portfolios/${portfolioId}/transfers`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ type, amount, fee, date, note }),
  });
  return res.json() as Promise<{ data: { id: number } }>;
}

async function createTransaction(
  symbol: string,
  type: string,
  quantity: number,
  price: number,
  fee: number,
  date: string,
) {
  const res = await ctx.request(`/api/portfolios/${portfolioId}/transactions`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ symbol, type, quantity, price, fee, date }),
  });
  return res.json() as Promise<{ data: { id: number } }>;
}

describe("GET /api/portfolios/:id/cash-movements", () => {
  it("[UC-PORTFOLIO-014-S01] returns empty list for portfolio with no movements", async () => {
    const { status, data } = await fetchCashMovements();
    expect(status).toBe(200);
    expect(data).toEqual([]);
  });

  it("[UC-PORTFOLIO-014-S02] returns deposit with correct amount and balance", async () => {
    await createTransfer("deposit", 10000, 0, "2024-01-01");
    const { status, data } = await fetchCashMovements();
    expect(status).toBe(200);
    expect(data).toHaveLength(1);
    expect(data[0].type).toBe("deposit");
    expect(data[0].amount).toBe(10000);
    expect(data[0].cash_balance).toBe(10000);
    expect(data[0].symbol).toBeNull();
  });

  it("[UC-PORTFOLIO-014-S03] returns correct amounts and running balance for deposit then buy", async () => {
    await createTransfer("deposit", 10000, 0, "2024-01-01");
    await createTransaction("AAPL", "buy", 10, 150, 0, "2024-01-15");

    const { data } = await fetchCashMovements();
    // Returned in reverse chronological order (newest first)
    expect(data).toHaveLength(2);
    expect(data[0].type).toBe("buy");
    expect(data[0].amount).toBe(-1500);
    expect(data[0].cash_balance).toBe(8500);
    expect(data[1].type).toBe("deposit");
    expect(data[1].amount).toBe(10000);
    expect(data[1].cash_balance).toBe(10000);
  });

  it("[UC-PORTFOLIO-014-S04] interleaves events chronologically", async () => {
    await createTransfer("deposit", 10000, 0, "2024-01-01");
    await createTransaction("AAPL", "buy", 10, 150, 0, "2024-01-15");

    const { data } = await fetchCashMovements();
    // Newest first: buy (Jan 15), then deposit (Jan 1)
    expect(data[0].date).toBe("2024-01-15");
    expect(data[0].type).toBe("buy");
    expect(data[1].date).toBe("2024-01-01");
    expect(data[1].type).toBe("deposit");
  });

  it("[UC-PORTFOLIO-014-S05] returns all movement types with correct amounts and balances", async () => {
    await createTransfer("deposit", 10000, 0, "2024-01-01");
    await createTransaction("AAPL", "buy", 10, 150, 5, "2024-01-15");
    await createTransaction("AAPL", "sell", 5, 200, 5, "2024-02-01");
    // Dividend: 100 shares @ $0.50/share, tax=$5 → delta = 100*0.50 - 5 = 45
    await createTransaction("AAPL", "dividend", 100, 0.5, 5, "2024-02-15");
    await createTransfer("withdrawal", 1000, 10, "2024-03-01");

    const { data } = await fetchCashMovements();
    // Reverse chronological: withdrawal, dividend, sell, buy, deposit
    expect(data).toHaveLength(5);

    // Withdrawal: -(1000 + 10) = -1010
    // balance = 10000 - 1505 + 995 + 45 - 1010 = 8525
    expect(data[0].type).toBe("withdrawal");
    expect(data[0].amount).toBe(-1010);
    expect(data[0].cash_balance).toBe(8525);

    // Dividend: 100*0.50 - 5 = 45
    expect(data[1].type).toBe("dividend");
    expect(data[1].amount).toBe(45);

    // Sell: 5*200 - 5 = 995
    expect(data[2].type).toBe("sell");
    expect(data[2].amount).toBe(995);

    // Buy: -(10*150 + 5) = -1505
    expect(data[3].type).toBe("buy");
    expect(data[3].amount).toBe(-1505);

    // Deposit: 10000
    expect(data[4].type).toBe("deposit");
    expect(data[4].amount).toBe(10000);
    expect(data[4].cash_balance).toBe(10000);
  });

  it("[UC-PORTFOLIO-014-S06] returns movements in reverse chronological order", async () => {
    await createTransfer("deposit", 5000, 0, "2024-01-01");
    await createTransaction("MSFT", "initial", 5, 100, 0, "2024-01-10");
    await createTransfer("deposit", 3000, 0, "2024-02-01");

    const { data } = await fetchCashMovements();
    expect(data).toHaveLength(3);
    // Newest first
    expect(data[0].date).toBe("2024-02-01");
    expect(data[1].date).toBe("2024-01-10");
    expect(data[2].date).toBe("2024-01-01");
  });

  it("returns 404 for non-existent portfolio", async () => {
    const res = await ctx.request(`/api/portfolios/99999/cash-movements`, {
      headers: authHeaders(),
    });
    expect(res.status).toBe(404);
  });

  it("includes symbol for transactions and note for transfers", async () => {
    await createTransfer("deposit", 5000, 0, "2024-01-01", "Initial funding");
    await createTransaction("AAPL", "buy", 5, 100, 0, "2024-01-15");

    const { data } = await fetchCashMovements();
    const deposit = data.find((m) => m.type === "deposit");
    const buy = data.find((m) => m.type === "buy");

    expect(deposit?.note).toBe("Initial funding");
    expect(deposit?.symbol).toBeNull();
    expect(buy?.symbol).toBe("AAPL");
    expect(buy?.note).toBeNull();
  });
});
