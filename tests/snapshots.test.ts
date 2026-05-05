import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestContext, cleanDatabase, createApiTokenForUser } from "./helpers";
import type { TestContext } from "./helpers";
import { calculateSnapshot } from "../src/routes/snapshots";

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
  const userId = userResult!.id;
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

describe("Portfolio Snapshots", () => {
  it("[UC-PORTFOLIO-008-S01] creates a snapshot", async () => {
    const res = await ctx.request(`/api/portfolios/${portfolioId}/snapshots`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        date: "2024-12-31",
        total_investment: 100000,
        market_value: 120000,
        cash_balance: 5000,
        note: "Year end",
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      data: {
        id: number;
        date: string;
        total_investment: number;
        market_value: number;
        cash_balance: number;
        note: string | null;
      };
    };
    expect(body.data.date).toBe("2024-12-31");
    expect(body.data.total_investment).toBe(100000);
    expect(body.data.market_value).toBe(120000);
    expect(body.data.cash_balance).toBe(5000);
    expect(body.data.note).toBe("Year end");
    expect(body.data.id).toBeGreaterThan(0);
  });

  it("[UC-PORTFOLIO-008-S02] rejects duplicate date", async () => {
    await ctx.request(`/api/portfolios/${portfolioId}/snapshots`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        date: "2024-12-31",
        total_investment: 100000,
        market_value: 120000,
        cash_balance: 5000,
      }),
    });

    const res = await ctx.request(`/api/portfolios/${portfolioId}/snapshots`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        date: "2024-12-31",
        total_investment: 110000,
        market_value: 130000,
        cash_balance: 6000,
      }),
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("already exists");
  });

  it("[UC-PORTFOLIO-008-S03] lists snapshots sorted by date DESC", async () => {
    const dates = ["2024-01-15", "2024-06-30", "2024-12-31"];
    for (const date of dates) {
      await ctx.request(`/api/portfolios/${portfolioId}/snapshots`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          total_investment: 100000,
          market_value: 120000,
          cash_balance: 5000,
        }),
      });
    }

    const res = await ctx.request(`/api/portfolios/${portfolioId}/snapshots`, {
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Array<{ date: string }> };
    expect(body.data).toHaveLength(3);
    expect(body.data[0].date).toBe("2024-12-31");
    expect(body.data[1].date).toBe("2024-06-30");
    expect(body.data[2].date).toBe("2024-01-15");
  });

  it("[UC-PORTFOLIO-008-S04] deletes a snapshot", async () => {
    const createRes = await ctx.request(`/api/portfolios/${portfolioId}/snapshots`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        date: "2024-12-31",
        total_investment: 100000,
        market_value: 120000,
        cash_balance: 5000,
      }),
    });
    const { data: snapshot } = (await createRes.json()) as { data: { id: number } };

    const delRes = await ctx.request(`/api/portfolios/${portfolioId}/snapshots/${snapshot.id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    expect(delRes.status).toBe(200);

    const listRes = await ctx.request(`/api/portfolios/${portfolioId}/snapshots`, {
      headers: authHeaders(),
    });
    const listBody = (await listRes.json()) as { data: unknown[] };
    expect(listBody.data).toHaveLength(0);
  });

  it("[UC-PORTFOLIO-008-S05] returns 404 for other user's portfolio", async () => {
    const otherUserResult = await db
      .prepare("INSERT INTO users (email) VALUES (?) RETURNING id")
      .bind("other@example.com")
      .first<{ id: number }>();

    const otherPortfolioResult = await db
      .prepare("INSERT INTO portfolios (user_id, name, currency) VALUES (?, ?, ?) RETURNING id")
      .bind(otherUserResult!.id, "Other Portfolio", "USD")
      .first<{ id: number }>();
    const otherPortfolioId = otherPortfolioResult!.id;

    const res = await ctx.request(`/api/portfolios/${otherPortfolioId}/snapshots`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        date: "2024-12-31",
        total_investment: 100000,
        market_value: 120000,
        cash_balance: 5000,
      }),
    });
    expect(res.status).toBe(404);
  });
});

describe("Calculated Snapshots", () => {
  async function makeDeposit(amount: number, date = "2024-01-01") {
    const res = await ctx.request(`/api/portfolios/${portfolioId}/transfers`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ type: "deposit", amount, fee: 0, date }),
    });
    return (await res.json()) as { data: { id: number } };
  }

  async function makeBuy(
    symbol: string,
    quantity: number,
    price: number,
    fee: number,
    date = "2024-01-15",
  ) {
    const res = await ctx.request(`/api/portfolios/${portfolioId}/transactions`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ symbol, type: "buy", quantity, price, fee, date }),
    });
    return (await res.json()) as { data: { id: number } };
  }

  async function makeSell(
    symbol: string,
    quantity: number,
    price: number,
    fee: number,
    date = "2024-06-01",
  ) {
    const res = await ctx.request(`/api/portfolios/${portfolioId}/transactions`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ symbol, type: "sell", quantity, price, fee, date }),
    });
    return (await res.json()) as { data: { id: number } };
  }

  async function seedPrice(symbol: string, date: string, close: number) {
    await db
      .prepare("INSERT INTO price_history (symbol, date, close) VALUES (?, ?, ?)")
      .bind(symbol, date, close)
      .run();
  }

  it("[UC-PORTFOLIO-008-S06] calculates snapshot from transactions and price_history", async () => {
    await makeDeposit(20000);
    await makeBuy("AAPL", 100, 150, 5, "2024-01-15");
    await seedPrice("AAPL", "2024-03-01", 180);

    const res = await ctx.request(`/api/portfolios/${portfolioId}/snapshots/calculate`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ date: "2024-03-01" }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      data: { total_investment: number; market_value: number; cash_balance: number };
    };
    expect(body.data.total_investment).toBe(20000);
    expect(body.data.market_value).toBe(18000);
    expect(body.data.cash_balance).toBe(20000 - 15005);
  });

  it("[UC-PORTFOLIO-008-S07] returns 422 when price_history missing", async () => {
    await makeDeposit(20000);
    await makeBuy("AAPL", 100, 150, 5, "2024-01-15");

    const res = await ctx.request(`/api/portfolios/${portfolioId}/snapshots/calculate`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ date: "2024-03-01" }),
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("AAPL");
  });

  it("[UC-PORTFOLIO-008-S09] rejects future date", async () => {
    const res = await ctx.request(`/api/portfolios/${portfolioId}/snapshots/calculate`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ date: "2099-12-31" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("future");
  });

  it("[UC-PORTFOLIO-008-S10] returns 409 if snapshot exists for date", async () => {
    await ctx.request(`/api/portfolios/${portfolioId}/snapshots`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        date: "2024-03-01",
        total_investment: 20000,
        market_value: 18000,
        cash_balance: 4995,
      }),
    });

    await makeDeposit(20000);
    await makeBuy("AAPL", 100, 150, 5, "2024-01-15");
    await seedPrice("AAPL", "2024-03-01", 180);

    const res = await ctx.request(`/api/portfolios/${portfolioId}/snapshots/calculate`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ date: "2024-03-01" }),
    });
    expect(res.status).toBe(409);
  });

  it("[UC-PORTFOLIO-008-S11] calculates market_value after partial sells", async () => {
    await makeDeposit(30000);
    await makeBuy("AAPL", 100, 150, 5, "2024-01-15");
    await makeSell("AAPL", 50, 200, 5, "2024-06-01");

    await seedPrice("AAPL", "2024-06-30", 190);

    const result = await calculateSnapshot(db, portfolioId, "2024-06-30");

    expect(result.market_value).toBe(50 * 190);
    expect(result.total_investment).toBe(30000);
    expect(result.cash_balance).toBe(30000 - 15005 + 9995);
    expect(result.missing_prices).toEqual([]);
  });

  it("[UC-PORTFOLIO-008-S12] returns 404 for other user's portfolio", async () => {
    const otherUserResult = await db
      .prepare("INSERT INTO users (email) VALUES (?) RETURNING id")
      .bind("other2@example.com")
      .first<{ id: number }>();

    const otherPortfolioResult = await db
      .prepare("INSERT INTO portfolios (user_id, name, currency) VALUES (?, ?, ?) RETURNING id")
      .bind(otherUserResult!.id, "Other Portfolio 2", "USD")
      .first<{ id: number }>();
    const otherPortfolioId = otherPortfolioResult!.id;

    const res = await ctx.request(`/api/portfolios/${otherPortfolioId}/snapshots/calculate`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ date: "2024-03-01" }),
    });
    expect(res.status).toBe(404);
  });

  it("[UC-PORTFOLIO-008-S13] calculates incrementally from previous snapshot", async () => {
    // Create first snapshot with manually adjusted values (simulating calibration)
    await ctx.request(`/api/portfolios/${portfolioId}/snapshots`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        date: "2024-01-31",
        total_investment: 10000,
        market_value: 10500,
        cash_balance: 500, // Manually calibrated value
      }),
    });

    // Add transactions after the snapshot
    await ctx.request(`/api/portfolios/${portfolioId}/transfers`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ type: "deposit", amount: 5000, fee: 0, date: "2024-02-15" }),
    });

    await ctx.request(`/api/portfolios/${portfolioId}/transactions`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        symbol: "AAPL",
        type: "buy",
        quantity: 10,
        price: 150,
        fee: 5,
        date: "2024-02-20",
      }),
    });

    await seedPrice("AAPL", "2024-02-28", 160);

    // Calculate new snapshot - should use previous snapshot as baseline
    const result = await calculateSnapshot(db, portfolioId, "2024-02-28");

    // total_investment: 10000 (prev) + 5000 (deposit) = 15000
    expect(result.total_investment).toBe(15000);
    // cash_balance: 500 (prev calibrated) + 5000 (deposit) - 1505 (buy) = 3995
    expect(result.cash_balance).toBe(3995);
    // market_value: 10 * 160 = 1600
    expect(result.market_value).toBe(1600);
  });

  it("[UC-PORTFOLIO-008-S14] interest excluded from total_investment in incremental calc", async () => {
    // Create first snapshot
    await ctx.request(`/api/portfolios/${portfolioId}/snapshots`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        date: "2024-01-31",
        total_investment: 10000,
        market_value: 0,
        cash_balance: 10000,
      }),
    });

    // Add interest after snapshot
    await ctx.request(`/api/portfolios/${portfolioId}/transfers`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ type: "interest", amount: 100, fee: 0, date: "2024-02-15" }),
    });

    const result = await calculateSnapshot(db, portfolioId, "2024-02-28");

    // total_investment should NOT include interest
    expect(result.total_investment).toBe(10000);
    // cash_balance should include interest
    expect(result.cash_balance).toBe(10100);
  });
});
