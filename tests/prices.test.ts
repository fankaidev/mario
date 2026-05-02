import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPlatformProxy, unstable_dev } from "wrangler";
import type { UnstableDevWorker } from "wrangler";
import { cleanDatabase } from "./helpers";
import { FakePriceFetcher } from "./fake-price-fetcher";
import { updatePrices } from "../src/routes/prices";
import { FetcherRouter } from "../src/clients/fetcher-router";

let worker: UnstableDevWorker;
let db: D1Database;
let portfolioId: number;

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
  const portfolioResult = await db
    .prepare("INSERT INTO portfolios (user_id, name, currency) VALUES (?, ?, ?) RETURNING id")
    .bind(userResult!.id, "US Stocks", "USD")
    .first<{ id: number }>();
  portfolioId = portfolioResult!.id;
});

async function seedLot(symbol: string) {
  const txResult = await db
    .prepare(
      "INSERT INTO transactions (portfolio_id, symbol, type, quantity, price, fee, date) VALUES (?, ?, 'buy', 100, 150, 0, '2024-01-01')",
    )
    .bind(portfolioId, symbol)
    .run();
  await db
    .prepare(
      "INSERT INTO lots (transaction_id, portfolio_id, symbol, quantity, remaining_quantity, cost_basis) VALUES (?, ?, ?, 100, 100, 15000)",
    )
    .bind(txResult.meta.last_row_id, portfolioId, symbol)
    .run();
}

describe("Price Update", () => {
  it("[UC-PORTFOLIO-005-S01] updates prices for held stocks", async () => {
    await seedLot("AAPL");
    await seedLot("TSLA");

    const fetcher = new FakePriceFetcher();
    fetcher.setPrice("AAPL", 180);
    fetcher.setPrice("TSLA", 250);

    const updated = await updatePrices(db, fetcher);
    expect(updated).toBe(2);

    const aapl = await db
      .prepare("SELECT price FROM prices WHERE symbol = ?")
      .bind("AAPL")
      .first<{ price: number }>();
    expect(aapl!.price).toBe(180);
    const tsla = await db
      .prepare("SELECT price FROM prices WHERE symbol = ?")
      .bind("TSLA")
      .first<{ price: number }>();
    expect(tsla!.price).toBe(250);
  });

  it("[UC-PORTFOLIO-005-S02] stores price and timestamp", async () => {
    await seedLot("AAPL");

    const fetcher = new FakePriceFetcher();
    fetcher.setPrice("AAPL", 175.5);

    const updated = await updatePrices(db, fetcher);
    expect(updated).toBe(1);

    const row = await db
      .prepare("SELECT price, updated_at FROM prices WHERE symbol = ?")
      .bind("AAPL")
      .first<{ price: number; updated_at: string }>();
    expect(row!.price).toBe(175.5);
    expect(row!.updated_at).not.toBeNull();
  });

  it("[UC-PORTFOLIO-005-S03] continues on individual fetch failure", async () => {
    await seedLot("AAPL");
    await seedLot("TSLA");

    const fetcher = new FakePriceFetcher();
    fetcher.setPrice("AAPL", 180);
    fetcher.setFailure("TSLA");

    const updated = await updatePrices(db, fetcher);
    expect(updated).toBe(1);

    const aapl = await db
      .prepare("SELECT price FROM prices WHERE symbol = ?")
      .bind("AAPL")
      .first<{ price: number }>();
    expect(aapl!.price).toBe(180);
    const tsla = await db.prepare("SELECT price FROM prices WHERE symbol = ?").bind("TSLA").first();
    expect(tsla).toBeNull();
  });

  it("[UC-PORTFOLIO-005-S04] returns 0 when no holdings", async () => {
    const fetcher = new FakePriceFetcher();
    const updated = await updatePrices(db, fetcher);
    expect(updated).toBe(0);
  });

  it("[UC-PORTFOLIO-005-S05] returns 401 when unauthenticated", async () => {
    const res = await worker.fetch("http://localhost/api/prices/update", {
      method: "POST",
    });
    expect(res.status).toBe(401);
  });

  it("[UC-PORTFOLIO-005-S06] stores stock name in stocks table", async () => {
    await seedLot("AAPL");

    const fetcher = new FakePriceFetcher();
    fetcher.setPrice("AAPL", 180);
    fetcher.setName("AAPL", "Apple Inc");

    const updated = await updatePrices(db, fetcher);
    expect(updated).toBe(1);

    const row = await db
      .prepare("SELECT name FROM stocks WHERE symbol = ?")
      .bind("AAPL")
      .first<{ name: string }>();
    expect(row!.name).toBe("Apple Inc");
  });

  it("[UC-PORTFOLIO-005-S07] updates prices for HK/SS/SZ stocks via Yahoo Finance", async () => {
    await seedLot("0700.HK");
    await seedLot("600519.SS");

    const finnhub = new FakePriceFetcher();
    const yahoo = new FakePriceFetcher();
    const eastmoney = new FakePriceFetcher();
    yahoo.setPrice("0700.HK", 350.0);
    yahoo.setPrice("600519.SS", 1500.0);

    const router = new FetcherRouter(finnhub, yahoo, eastmoney);
    const updated = await updatePrices(db, router);
    expect(updated).toBe(2);

    const hk = await db
      .prepare("SELECT price FROM prices WHERE symbol = ?")
      .bind("0700.HK")
      .first<{ price: number }>();
    expect(hk!.price).toBe(350.0);

    const ss = await db
      .prepare("SELECT price FROM prices WHERE symbol = ?")
      .bind("600519.SS")
      .first<{ price: number }>();
    expect(ss!.price).toBe(1500.0);

    // Finnhub and Eastmoney should not have been called
    expect(finnhub.getAccessedSymbols()).toEqual([]);
    expect(eastmoney.getAccessedSymbols()).toEqual([]);
  });

  it("[UC-PORTFOLIO-005-S08] routes mixed portfolio to correct fetchers", async () => {
    await seedLot("AAPL");
    await seedLot("0700.HK");

    const finnhub = new FakePriceFetcher();
    const yahoo = new FakePriceFetcher();
    const eastmoney = new FakePriceFetcher();
    finnhub.setPrice("AAPL", 180.0);
    yahoo.setPrice("0700.HK", 350.0);

    const router = new FetcherRouter(finnhub, yahoo, eastmoney);
    const updated = await updatePrices(db, router);
    expect(updated).toBe(2);

    const aapl = await db
      .prepare("SELECT price FROM prices WHERE symbol = ?")
      .bind("AAPL")
      .first<{ price: number }>();
    expect(aapl!.price).toBe(180.0);

    const hk = await db
      .prepare("SELECT price FROM prices WHERE symbol = ?")
      .bind("0700.HK")
      .first<{ price: number }>();
    expect(hk!.price).toBe(350.0);

    // Verify correct routing
    expect(finnhub.getAccessedSymbols()).toEqual(["AAPL"]);
    expect(yahoo.getAccessedSymbols()).toEqual(["0700.HK"]);
    expect(eastmoney.getAccessedSymbols()).toEqual([]);
  });

  it("[UC-PORTFOLIO-005-S09] updates NAV for mutual funds via Eastmoney", async () => {
    await seedLot("000979");
    await seedLot("000217");

    const finnhub = new FakePriceFetcher();
    const yahoo = new FakePriceFetcher();
    const eastmoney = new FakePriceFetcher();
    eastmoney.setPrice("000979", 1.5);
    eastmoney.setPrice("000217", 2.3);

    const router = new FetcherRouter(finnhub, yahoo, eastmoney);
    const updated = await updatePrices(db, router);
    expect(updated).toBe(2);

    const fund1 = await db
      .prepare("SELECT price FROM prices WHERE symbol = ?")
      .bind("000979")
      .first<{ price: number }>();
    expect(fund1!.price).toBe(1.5);

    const fund2 = await db
      .prepare("SELECT price FROM prices WHERE symbol = ?")
      .bind("000217")
      .first<{ price: number }>();
    expect(fund2!.price).toBe(2.3);

    // Finnhub and Yahoo should not have been called
    expect(finnhub.getAccessedSymbols()).toEqual([]);
    expect(yahoo.getAccessedSymbols()).toEqual([]);
  });

  it("[UC-PORTFOLIO-005-S10] routes all symbol types correctly", async () => {
    await seedLot("AAPL");
    await seedLot("0700.HK");
    await seedLot("000979");

    const finnhub = new FakePriceFetcher();
    const yahoo = new FakePriceFetcher();
    const eastmoney = new FakePriceFetcher();
    finnhub.setPrice("AAPL", 180.0);
    yahoo.setPrice("0700.HK", 350.0);
    eastmoney.setPrice("000979", 1.5);

    const router = new FetcherRouter(finnhub, yahoo, eastmoney);
    const updated = await updatePrices(db, router);
    expect(updated).toBe(3);

    const aapl = await db
      .prepare("SELECT price FROM prices WHERE symbol = ?")
      .bind("AAPL")
      .first<{ price: number }>();
    expect(aapl!.price).toBe(180.0);

    const hk = await db
      .prepare("SELECT price FROM prices WHERE symbol = ?")
      .bind("0700.HK")
      .first<{ price: number }>();
    expect(hk!.price).toBe(350.0);

    const fund = await db
      .prepare("SELECT price FROM prices WHERE symbol = ?")
      .bind("000979")
      .first<{ price: number }>();
    expect(fund!.price).toBe(1.5);

    // Verify correct routing
    expect(finnhub.getAccessedSymbols()).toEqual(["AAPL"]);
    expect(yahoo.getAccessedSymbols()).toEqual(["0700.HK"]);
    expect(eastmoney.getAccessedSymbols()).toEqual(["000979"]);
  });
});
