import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestContext, cleanDatabase, createApiTokenForUser } from "./helpers";
import type { TestContext } from "./helpers";
import { FakePriceFetcher } from "./fake-price-fetcher";
import { syncPriceHistory, getLatestPrice } from "../src/routes/prices";
import { FetcherRouter } from "../src/clients/fetcher-router";

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

async function makeBuy(symbol: string) {
  const res = await ctx.request(`/api/portfolios/${portfolioId}/transactions`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({
      symbol,
      type: "buy",
      quantity: 100,
      price: 150,
      fee: 0,
      date: "2024-01-01",
    }),
  });
  return (await res.json()) as { data: { id: number } };
}

describe("Price Sync", () => {
  it("[UC-PORTFOLIO-005-S01] syncs prices for held stocks", async () => {
    await makeBuy("AAPL");
    await makeBuy("TSLA");

    const finnhub = new FakePriceFetcher();
    const yahoo = new FakePriceFetcher();
    const eastmoney = new FakePriceFetcher();
    yahoo.setHistory("AAPL", [{ date: "2024-01-15", close: 180 }]);
    yahoo.setHistory("TSLA", [{ date: "2024-01-15", close: 250 }]);

    const router = new FetcherRouter(finnhub, yahoo, eastmoney);
    const records1 = await syncPriceHistory(db, router, "AAPL", "2024-01-01");
    const records2 = await syncPriceHistory(db, router, "TSLA", "2024-01-01");

    expect(records1).toBe(1);
    expect(records2).toBe(1);

    const aaplPrice = await getLatestPrice(db, "AAPL");
    expect(aaplPrice).toBe(180);
    const tslaPrice = await getLatestPrice(db, "TSLA");
    expect(tslaPrice).toBe(250);
  });

  it("[UC-PORTFOLIO-005-S04] returns 0 when no data to sync", async () => {
    const finnhub = new FakePriceFetcher();
    const yahoo = new FakePriceFetcher();
    const eastmoney = new FakePriceFetcher();
    const router = new FetcherRouter(finnhub, yahoo, eastmoney);

    const records = await syncPriceHistory(db, router, "AAPL", "2024-01-01");
    expect(records).toBe(0);
  });

  it("[UC-PORTFOLIO-005-S05] returns 401 when unauthenticated", async () => {
    const res = await ctx.request("/api/prices/sync", {
      method: "POST",
    });
    expect(res.status).toBe(401);
  });

  it("[UC-PORTFOLIO-005-S07] syncs prices for HK/SS/SZ stocks via Eastmoney", async () => {
    await makeBuy("0700.HK");
    await makeBuy("600519.SS");

    const finnhub = new FakePriceFetcher();
    const yahoo = new FakePriceFetcher();
    const eastmoney = new FakePriceFetcher();
    eastmoney.setHistory("0700.HK", [{ date: "2024-01-15", close: 350.0 }]);
    eastmoney.setHistory("600519.SS", [{ date: "2024-01-15", close: 1500.0 }]);

    const router = new FetcherRouter(finnhub, yahoo, eastmoney);
    const records1 = await syncPriceHistory(db, router, "0700.HK", "2024-01-01");
    const records2 = await syncPriceHistory(db, router, "600519.SS", "2024-01-01");

    expect(records1).toBe(1);
    expect(records2).toBe(1);

    const hkPrice = await getLatestPrice(db, "0700.HK");
    expect(hkPrice).toBe(350.0);
    const ssPrice = await getLatestPrice(db, "600519.SS");
    expect(ssPrice).toBe(1500.0);

    expect(finnhub.getAccessedSymbols()).toEqual([]);
    expect(yahoo.getAccessedSymbols()).toEqual([]);
  });

  it("[UC-PORTFOLIO-005-S08] routes mixed portfolio to correct fetchers", async () => {
    await makeBuy("AAPL");
    await makeBuy("0700.HK");

    const finnhub = new FakePriceFetcher();
    const yahoo = new FakePriceFetcher();
    const eastmoney = new FakePriceFetcher();
    yahoo.setHistory("AAPL", [{ date: "2024-01-15", close: 180.0 }]);
    eastmoney.setHistory("0700.HK", [{ date: "2024-01-15", close: 350.0 }]);

    const router = new FetcherRouter(finnhub, yahoo, eastmoney);
    await syncPriceHistory(db, router, "AAPL", "2024-01-01");
    await syncPriceHistory(db, router, "0700.HK", "2024-01-01");

    const aaplPrice = await getLatestPrice(db, "AAPL");
    expect(aaplPrice).toBe(180.0);
    const hkPrice = await getLatestPrice(db, "0700.HK");
    expect(hkPrice).toBe(350.0);

    expect(yahoo.getAccessedSymbols()).toEqual(["AAPL"]);
    expect(finnhub.getAccessedSymbols()).toEqual([]);
    expect(eastmoney.getAccessedSymbols()).toEqual(["0700.HK"]);
  });

  it("[UC-PORTFOLIO-005-S09] syncs NAV for mutual funds via Eastmoney", async () => {
    await makeBuy("000979");
    await makeBuy("000217");

    const finnhub = new FakePriceFetcher();
    const yahoo = new FakePriceFetcher();
    const eastmoney = new FakePriceFetcher();
    eastmoney.setHistory("000979", [{ date: "2024-01-15", close: 1.5 }]);
    eastmoney.setHistory("000217", [{ date: "2024-01-15", close: 2.3 }]);

    const router = new FetcherRouter(finnhub, yahoo, eastmoney);
    const records1 = await syncPriceHistory(db, router, "000979", "2024-01-01");
    const records2 = await syncPriceHistory(db, router, "000217", "2024-01-01");

    expect(records1).toBe(1);
    expect(records2).toBe(1);

    const fund1Price = await getLatestPrice(db, "000979");
    expect(fund1Price).toBe(1.5);
    const fund2Price = await getLatestPrice(db, "000217");
    expect(fund2Price).toBe(2.3);

    expect(finnhub.getAccessedSymbols()).toEqual([]);
    expect(yahoo.getAccessedSymbols()).toEqual([]);
  });

  it("[UC-PORTFOLIO-005-S10] routes all symbol types correctly", async () => {
    await makeBuy("AAPL");
    await makeBuy("0700.HK");
    await makeBuy("000979");

    const finnhub = new FakePriceFetcher();
    const yahoo = new FakePriceFetcher();
    const eastmoney = new FakePriceFetcher();
    yahoo.setHistory("AAPL", [{ date: "2024-01-15", close: 180.0 }]);
    eastmoney.setHistory("0700.HK", [{ date: "2024-01-15", close: 350.0 }]);
    eastmoney.setHistory("000979", [{ date: "2024-01-15", close: 1.5 }]);

    const router = new FetcherRouter(finnhub, yahoo, eastmoney);
    await syncPriceHistory(db, router, "AAPL", "2024-01-01");
    await syncPriceHistory(db, router, "0700.HK", "2024-01-01");
    await syncPriceHistory(db, router, "000979", "2024-01-01");

    const aaplPrice = await getLatestPrice(db, "AAPL");
    expect(aaplPrice).toBe(180.0);
    const hkPrice = await getLatestPrice(db, "0700.HK");
    expect(hkPrice).toBe(350.0);
    const fundPrice = await getLatestPrice(db, "000979");
    expect(fundPrice).toBe(1.5);

    expect(yahoo.getAccessedSymbols()).toEqual(["AAPL"]);
    expect(finnhub.getAccessedSymbols()).toEqual([]);
    expect(eastmoney.getAccessedSymbols()).toEqual(["0700.HK", "000979"]);
  });
});

describe("Price History", () => {
  it("[UC-PORTFOLIO-003-S12] returns price history for held stock", async () => {
    await makeBuy("AAPL");
    await db
      .prepare(
        "INSERT INTO price_history (symbol, date, close) VALUES ('AAPL', '2024-01-15', 150), ('AAPL', '2024-02-15', 160), ('AAPL', '2024-03-15', 170)",
      )
      .run();

    const res = await ctx.request("/api/prices/history/AAPL", {
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: { symbol: string; prices: Array<{ date: string; close: number }> };
    };
    expect(json.data.symbol).toBe("AAPL");
    expect(json.data.prices).toHaveLength(3);
    expect(json.data.prices[0]).toEqual({ date: "2024-01-15", close: 150 });
    expect(json.data.prices[2]).toEqual({ date: "2024-03-15", close: 170 });
  });

  it("[UC-PORTFOLIO-003-S13] returns price history for symbol within date range", async () => {
    await db
      .prepare(
        "INSERT INTO price_history (symbol, date, close) VALUES ('AAPL', '2024-01-15', 150), ('AAPL', '2024-02-15', 160), ('AAPL', '2024-03-15', 170)",
      )
      .run();

    const res = await ctx.request(
      "/api/prices/history/AAPL?start_date=2024-02-01&end_date=2024-02-28",
      { headers: authHeaders() },
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: { symbol: string; prices: Array<{ date: string; close: number }> };
    };
    expect(json.data.symbol).toBe("AAPL");
    expect(json.data.prices).toHaveLength(1);
    expect(json.data.prices[0]).toEqual({ date: "2024-02-15", close: 160 });
  });

  it("[UC-PORTFOLIO-003-S13b] returns all price history when no date range specified", async () => {
    await db
      .prepare(
        "INSERT INTO price_history (symbol, date, close) VALUES ('TSLA', '2024-01-10', 200), ('TSLA', '2024-02-10', 220)",
      )
      .run();

    const res = await ctx.request("/api/prices/history/TSLA", {
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: { symbol: string; prices: Array<{ date: string; close: number }> };
    };
    expect(json.data.symbol).toBe("TSLA");
    expect(json.data.prices).toHaveLength(2);
    expect(json.data.prices[0]).toEqual({ date: "2024-01-10", close: 200 });
    expect(json.data.prices[1]).toEqual({ date: "2024-02-10", close: 220 });
  });

  it("[UC-PORTFOLIO-003-S14] returns 401 when unauthenticated", async () => {
    const res = await ctx.request("/api/prices/history/AAPL");
    expect(res.status).toBe(401);
  });

  it("[UC-PORTFOLIO-003-S15] returns empty prices array when no price history exists", async () => {
    const res = await ctx.request("/api/prices/history/NVDA", {
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: { symbol: string; prices: Array<{ date: string; close: number }> };
    };
    expect(json.data.symbol).toBe("NVDA");
    expect(json.data.prices).toHaveLength(0);
  });
});
