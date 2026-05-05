import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestContext, cleanDatabase, createApiTokenForUser } from "./helpers";
import type { TestContext } from "./helpers";
import type { AggregatedSummary } from "../shared/types/api";

let ctx: TestContext;
let db: D1Database;
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
});

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${authToken}` };
}

async function createPortfolio(name: string, currency: string): Promise<number> {
  const res = await ctx.request("/api/portfolios", {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ name, currency }),
  });
  const body = (await res.json()) as { data: { id: number } };
  return body.data.id;
}

async function addDeposit(portfolioId: number, amount: number, date = "2024-01-01") {
  await ctx.request(`/api/portfolios/${portfolioId}/cash-transfers`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ type: "deposit", amount, fee: 0, date }),
  });
}

async function addBuy(
  portfolioId: number,
  symbol: string,
  quantity: number,
  price: number,
  fee = 0,
  date = "2024-01-15",
) {
  await ctx.request(`/api/portfolios/${portfolioId}/transactions`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ symbol, type: "buy", quantity, price, fee, date }),
  });
}

async function getAggregatedSummary(currency = "USD") {
  const res = await ctx.request(`/api/summary?currency=${currency}`, {
    headers: authHeaders(),
  });
  return { res, body: (await res.json()) as { data: AggregatedSummary } };
}

describe("Aggregated Summary", () => {
  it("[UC-PORTFOLIO-012-S01] single portfolio same currency returns matching values", async () => {
    const pId = await createPortfolio("US Stocks", "USD");
    await addDeposit(pId, 10000);
    await addBuy(pId, "AAPL", 100, 150, 5);
    await db
      .prepare("INSERT INTO price_history (symbol, date, close) VALUES ('AAPL', '2024-03-01', 180)")
      .run();

    const { res, body } = await getAggregatedSummary("USD");
    expect(res.status).toBe(200);
    expect(body.data.target_currency).toBe("USD");
    expect(body.data.portfolio_value).toBeGreaterThan(0);
    expect(body.data.portfolios.length).toBe(1);
    expect(body.data.portfolios[0]!.converted_summary).toBeDefined();
    expect(body.data.portfolios[0]!.native_summary.portfolio_value).toBe(
      body.data.portfolios[0]!.converted_summary!.portfolio_value,
    );
  });

  it("[UC-PORTFOLIO-012-S02] sums two same-currency portfolios correctly", async () => {
    const p1 = await createPortfolio("US Stocks", "USD");
    const p2 = await createPortfolio("US ETFs", "USD");

    await addDeposit(p1, 5000);
    await addDeposit(p2, 3000);

    const { body } = await getAggregatedSummary("USD");
    expect(body.data.total_investment).toBe(8000);
    expect(body.data.portfolios.length).toBe(2);
  });

  it("[UC-PORTFOLIO-012-S03] converts HKD to USD using exchange rate", async () => {
    const pId = await createPortfolio("HK Stocks", "HKD");
    await addDeposit(pId, 10000);
    await addBuy(pId, "0700.HK", 100, 300, 10);
    await db
      .prepare(
        "INSERT INTO price_history (symbol, date, close) VALUES ('0700.HK', '2024-03-01', 320)",
      )
      .run();
    await db
      .prepare(
        "INSERT INTO exchange_rates (from_currency, to_currency, date, rate) VALUES ('HKD', 'USD', '2024-03-01', 0.128)",
      )
      .run();

    const { body } = await getAggregatedSummary("USD");
    expect(body.data.portfolios.length).toBe(1);
    expect(body.data.portfolios[0]!.converted_summary).toBeDefined();

    const native = body.data.portfolios[0]!.native_summary;
    const converted = body.data.portfolios[0]!.converted_summary!;
    expect(converted.portfolio_value).toBeCloseTo(native.portfolio_value * 0.128, 0);
  });

  it("[UC-PORTFOLIO-012-S04] converts mixed currency portfolios to target", async () => {
    const pUSD = await createPortfolio("US Stocks", "USD");
    const pHKD = await createPortfolio("HK Stocks", "HKD");
    const pCNY = await createPortfolio("CN Stocks", "CNY");

    await addDeposit(pUSD, 10000);
    await addDeposit(pHKD, 50000);
    await addDeposit(pCNY, 50000);

    await addBuy(pUSD, "AAPL", 10, 150, 5);
    await addBuy(pHKD, "0700.HK", 100, 300, 10);
    await addBuy(pCNY, "600519.SS", 100, 1800, 10);

    await db
      .prepare(
        "INSERT INTO price_history (symbol, date, close) VALUES ('AAPL', '2024-03-01', 180), ('0700.HK', '2024-03-01', 320), ('600519.SS', '2024-03-01', 1900)",
      )
      .run();
    await db
      .prepare(
        "INSERT INTO exchange_rates (from_currency, to_currency, date, rate) VALUES ('HKD', 'USD', '2024-03-01', 0.128), ('CNY', 'USD', '2024-03-01', 0.14)",
      )
      .run();

    const { body } = await getAggregatedSummary("USD");
    expect(body.data.portfolios.length).toBe(3);
    // All three portfolios should have converted summaries
    for (const p of body.data.portfolios) {
      expect(p.converted_summary).toBeDefined();
    }
    // Aggregated value should be sum of all converted values
    expect(body.data.portfolio_value).toBeGreaterThan(0);
    expect(body.data.total_investment).toBeGreaterThan(0);
    expect(body.data.exchange_rate_updated_at).toBe("2024-03-01");
  });

  it("[UC-PORTFOLIO-012-S05] includes portfolio with null converted_summary when no rate available", async () => {
    const pId = await createPortfolio("HK Stocks", "HKD");
    await addDeposit(pId, 10000);

    const { body } = await getAggregatedSummary("USD");
    expect(body.data.portfolios.length).toBe(1);
    expect(body.data.portfolios[0]!.native_summary).toBeDefined();
    expect(body.data.portfolios[0]!.converted_summary).toBeNull();
    // Aggregated values should be 0 since no portfolio was converted
    expect(body.data.portfolio_value).toBe(0);
  });

  it("[UC-PORTFOLIO-012-S06] returns all zeros for empty portfolios", async () => {
    await createPortfolio("Empty", "USD");

    const { body } = await getAggregatedSummary("USD");
    expect(body.data.portfolio_value).toBe(0);
    expect(body.data.total_investment).toBe(0);
    expect(body.data.total_pnl).toBe(0);
    expect(body.data.return_rate).toBe(0);
    expect(body.data.portfolios.length).toBe(1);
  });

  it("[UC-PORTFOLIO-012-S07] returns 401 for unauthenticated access", async () => {
    const res = await ctx.request("/api/summary?currency=USD");
    expect(res.status).toBe(401);
  });

  it("[UC-PORTFOLIO-012-S08] excludes deleted portfolios", async () => {
    const p1 = await createPortfolio("Active", "USD");
    const p2 = await createPortfolio("Deleted", "USD");

    await addDeposit(p1, 5000);
    await addDeposit(p2, 3000);

    // Delete p2
    await ctx.request(`/api/portfolios/${p2}`, {
      method: "DELETE",
      headers: authHeaders(),
    });

    const { body } = await getAggregatedSummary("USD");
    expect(body.data.portfolios.length).toBe(1);
    expect(body.data.portfolios[0]!.portfolio_id).toBe(p1);
    expect(body.data.total_investment).toBe(5000);
  });

  it("[UC-PORTFOLIO-012-S09] exchange_rate_updated_at reflects oldest rate date used", async () => {
    const pHKD = await createPortfolio("HK Stocks", "HKD");
    const pCNY = await createPortfolio("CN Stocks", "CNY");

    await addDeposit(pHKD, 10000);
    await addDeposit(pCNY, 10000);

    await db
      .prepare(
        "INSERT INTO exchange_rates (from_currency, to_currency, date, rate) VALUES ('HKD', 'USD', '2024-01-15', 0.128), ('CNY', 'USD', '2024-02-20', 0.14)",
      )
      .run();

    const { body } = await getAggregatedSummary("USD");
    // The oldest rate date should be 2024-01-15
    expect(body.data.exchange_rate_updated_at).toBe("2024-01-15");
  });

  it("[UC-PORTFOLIO-012-S01b] accepts different target currencies", async () => {
    const pId = await createPortfolio("HK Stocks", "HKD");
    await addDeposit(pId, 10000);

    const { body } = await getAggregatedSummary("HKD");
    expect(body.data.target_currency).toBe("HKD");
    // Same currency, no conversion needed
    expect(body.data.portfolios[0]!.converted_summary).toBeDefined();
  });

  it("returns 400 for invalid currency", async () => {
    const res = await ctx.request("/api/summary?currency=XYZ", {
      headers: authHeaders(),
    });
    expect(res.status).toBe(400);
  });
});
