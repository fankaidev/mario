import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestContext, cleanDatabase, createApiTokenForUser } from "./helpers";
import type { TestContext } from "./helpers";
import type {
  AggregatedChartPoint,
  AggregatedPerformance,
  PortfolioPerformance,
} from "../shared/types/api";

let ctx: TestContext;
let db: D1Database;
let portfolioId: number;
let userId: number;
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

async function makeDeposit(amount: number, date: string) {
  await ctx.request(`/api/portfolios/${portfolioId}/cash-transfers`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ type: "deposit", amount, fee: 0, date }),
  });
}

describe("GET /api/portfolios/:id/performance", () => {
  it("[UC-PORTFOLIO-013-S01] ALL range returns start_value 0", async () => {
    await makeDeposit(10000, "2024-01-01");

    const res = await ctx.request(`/api/portfolios/${portfolioId}/performance?range=ALL`, {
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: PortfolioPerformance };
    expect(body.data.start_value).toBe(0);
    expect(body.data.end_value).toBeGreaterThan(0);
    expect(body.data.range).toBe("ALL");
  });

  it("[UC-PORTFOLIO-013-S02] returns 400 for invalid range", async () => {
    const res = await ctx.request(`/api/portfolios/${portfolioId}/performance?range=INVALID`, {
      headers: authHeaders(),
    });
    expect(res.status).toBe(400);
  });

  it("[UC-PORTFOLIO-013-S03] returns 404 for non-existent portfolio", async () => {
    const res = await ctx.request(`/api/portfolios/99999/performance?range=1Y`, {
      headers: authHeaders(),
    });
    expect(res.status).toBe(404);
  });

  it("[UC-PORTFOLIO-013-S04] returns 401 for unauthenticated request", async () => {
    const res = await ctx.request(`/api/portfolios/${portfolioId}/performance?range=1Y`);
    expect(res.status).toBe(401);
  });

  it("[UC-PORTFOLIO-013-S05] empty portfolio returns 400 for non-ALL range (no start value)", async () => {
    const res = await ctx.request(`/api/portfolios/${portfolioId}/performance?range=1Y`, {
      headers: authHeaders(),
    });
    expect(res.status).toBe(400);
  });

  it("[UC-PORTFOLIO-013-S06] P&L matches end_value - start_value - net_cash_flow", async () => {
    // Use a date two years ago, which is before the 1Y range start
    const today = new Date();
    const dateStr = `${today.getFullYear() - 2}-06-01`;

    await makeDeposit(50000, dateStr);

    // Create a snapshot at the same date (before the range start)
    await db
      .prepare(
        "INSERT INTO portfolio_snapshots (portfolio_id, date, total_investment, market_value, cash_balance) VALUES (?, ?, 50000, 0, 50000)",
      )
      .bind(portfolioId, dateStr)
      .run();

    const res = await ctx.request(`/api/portfolios/${portfolioId}/performance?range=1Y`, {
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: PortfolioPerformance };
    expect(body.data.pnl).toBe(
      body.data.end_value - body.data.start_value - body.data.net_cash_flow,
    );
  });
});

describe("GET /api/performance", () => {
  it("[UC-PORTFOLIO-013-S07] aggregates same-currency portfolios correctly", async () => {
    // Create second portfolio using the same userId
    const res2 = await db
      .prepare("INSERT INTO portfolios (user_id, name, currency) VALUES (?, ?, ?) RETURNING id")
      .bind(userId, "HK Stocks", "USD")
      .first<{ id: number }>();
    const portfolio2Id = res2!.id;

    const today = new Date();
    const dateStr = `${today.getFullYear() - 1}-01-02`;

    await makeDeposit(10000, `${today.getFullYear() - 1}-01-01`);
    await db
      .prepare(
        "INSERT INTO portfolio_snapshots (portfolio_id, date, total_investment, market_value, cash_balance) VALUES (?, ?, 10000, 0, 10000)",
      )
      .bind(portfolioId, dateStr)
      .run();

    // Add cash movement and snapshot for second portfolio
    await ctx.request(`/api/portfolios/${portfolio2Id}/cash-transfers`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "deposit",
        amount: 5000,
        fee: 0,
        date: `${today.getFullYear() - 1}-01-01`,
      }),
    });
    await db
      .prepare(
        "INSERT INTO portfolio_snapshots (portfolio_id, date, total_investment, market_value, cash_balance) VALUES (?, ?, 5000, 0, 5000)",
      )
      .bind(portfolio2Id, dateStr)
      .run();

    const res = await ctx.request(`/api/performance?range=ALL&currency=USD`, {
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: AggregatedPerformance };
    expect(body.data.target_currency).toBe("USD");
    expect(body.data.portfolios.length).toBe(2);
    expect(body.data.start_value).toBe(0); // ALL range has start_value 0
    expect(body.data.end_value).toBeGreaterThan(0);
  });

  it("[UC-PORTFOLIO-013-S08] returns 400 for invalid range", async () => {
    const res = await ctx.request(`/api/performance?range=bad&currency=USD`, {
      headers: authHeaders(),
    });
    expect(res.status).toBe(400);
  });

  it("[UC-PORTFOLIO-013-S09] returns 400 for invalid currency", async () => {
    const res = await ctx.request(`/api/performance?range=1Y&currency=EUR`, {
      headers: authHeaders(),
    });
    expect(res.status).toBe(400);
  });

  it("[UC-PORTFOLIO-013-S10] returns 401 for unauthenticated request", async () => {
    const res = await ctx.request(`/api/performance?range=1Y&currency=USD`);
    expect(res.status).toBe(401);
  });
});

describe("GET /api/performance/chart", () => {
  it("[UC-PORTFOLIO-013-S11] returns chart points", async () => {
    const today = new Date();
    const date1 = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
    const date2 = new Date(today.getFullYear(), today.getMonth(), 15).toISOString().split("T")[0]!;

    await makeDeposit(10000, date1);

    await db
      .prepare(
        "INSERT INTO portfolio_snapshots (portfolio_id, date, total_investment, market_value, cash_balance) VALUES (?, ?, 10000, 0, 10000)",
      )
      .bind(portfolioId, date1)
      .run();

    // Also insert a second snapshot
    if (date2 >= date1) {
      await db
        .prepare(
          "INSERT INTO portfolio_snapshots (portfolio_id, date, total_investment, market_value, cash_balance) VALUES (?, ?, 10000, 1000, 10000)",
        )
        .bind(portfolioId, date2)
        .run();
    }

    const res = await ctx.request(`/api/performance/chart?range=1M&currency=USD`, {
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: AggregatedChartPoint[] };
    expect(body.data.length).toBeGreaterThanOrEqual(1);

    // Total value should include cash_balance + market_value
    const lastPoint = body.data[body.data.length - 1]!;
    expect(lastPoint.total_value).toBeGreaterThan(0);
  });

  it("[UC-PORTFOLIO-013-S12] returns 401 for unauthenticated request", async () => {
    const res = await ctx.request(`/api/performance/chart?range=1Y&currency=USD`);
    expect(res.status).toBe(401);
  });

  it("[UC-PORTFOLIO-013-S13] returns empty array for no snapshots", async () => {
    const res = await ctx.request(`/api/performance/chart?range=1Y&currency=USD`, {
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: AggregatedChartPoint[] };
    expect(body.data).toEqual([]);
  });
});

describe("chart-series with range param", () => {
  it("[UC-PORTFOLIO-013-S14] range returns pnl in chart points", async () => {
    const today = new Date();
    const dateStr = `${today.getFullYear() - 1}-06-01`;

    await makeDeposit(10000, dateStr);
    await db
      .prepare(
        "INSERT INTO portfolio_snapshots (portfolio_id, date, total_investment, market_value, cash_balance) VALUES (?, ?, 10000, 0, 10000), (?, ?, 10000, 500, 10000)",
      )
      .bind(portfolioId, dateStr, portfolioId, `${today.getFullYear() - 1}-07-01`)
      .run();

    const res = await ctx.request(
      `/api/portfolios/${portfolioId}/snapshots/chart-series?range=1Y`,
      { headers: authHeaders() },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Array<{ date: string; pnl?: number }> };
    expect(body.data.length).toBeGreaterThan(0);
    for (const point of body.data) {
      expect(typeof point.pnl).toBe("number");
    }
  });

  it("[UC-PORTFOLIO-013-S15] backward compatible without range param", async () => {
    await makeDeposit(10000, "2024-01-01");
    await db
      .prepare(
        "INSERT INTO portfolio_snapshots (portfolio_id, date, total_investment, market_value, cash_balance) VALUES (?, '2024-01-02', 10000, 0, 10000)",
      )
      .bind(portfolioId)
      .run();

    const res = await ctx.request(`/api/portfolios/${portfolioId}/snapshots/chart-series`, {
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Array<{ date: string; pnl?: number }> };
    expect(body.data.length).toBe(1);
    expect(body.data[0]!.pnl).toBeUndefined();
  });
});
