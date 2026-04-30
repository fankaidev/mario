import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPlatformProxy, unstable_dev } from "wrangler";
import type { UnstableDevWorker } from "wrangler";
import { cleanDatabase } from "./helpers";

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

function authHeaders(): Record<string, string> {
  return { "CF-Access-Authenticated-User-Email": "test@example.com" };
}

async function seedBuy(symbol: string, quantity: number, price: number, fee: number) {
  const txRes = await db
    .prepare(
      "INSERT INTO transactions (portfolio_id, symbol, type, quantity, price, fee, date) VALUES (?, ?, 'buy', ?, ?, ?, '2024-01-01')",
    )
    .bind(portfolioId, symbol, quantity, price, fee)
    .run();
  await db
    .prepare(
      "INSERT INTO lots (transaction_id, portfolio_id, symbol, quantity, remaining_quantity, cost_basis) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(txRes.meta.last_row_id, portfolioId, symbol, quantity, quantity, quantity * price)
    .run();
}

async function seedSell(
  symbol: string,
  quantity: number,
  price: number,
  fee: number,
  lotId: number,
  consumed: number,
) {
  const txRes = await db
    .prepare(
      "INSERT INTO transactions (portfolio_id, symbol, type, quantity, price, fee, date) VALUES (?, ?, 'sell', ?, ?, ?, '2024-02-01')",
    )
    .bind(portfolioId, symbol, quantity, price, fee)
    .run();
  const lot = await db
    .prepare("SELECT quantity, cost_basis FROM lots WHERE id = ?")
    .bind(lotId)
    .first<{ quantity: number; cost_basis: number }>();
  const cost = (lot!.cost_basis / lot!.quantity) * consumed;
  const pnl = price * consumed - cost;
  await db
    .prepare(
      "INSERT INTO realized_pnl (sell_transaction_id, lot_id, quantity, proceeds, cost, pnl) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(txRes.meta.last_row_id, lotId, consumed, price * consumed, cost, pnl)
    .run();
  await db
    .prepare("UPDATE lots SET remaining_quantity = remaining_quantity - ? WHERE id = ?")
    .bind(consumed, lotId)
    .run();
}

async function getSummary() {
  const res = await worker.fetch(`http://localhost/api/portfolios/${portfolioId}/summary`, {
    headers: authHeaders(),
  });
  return (await res.json()) as {
    data: {
      total_investment: number;
      total_market_value: number;
      unrealized_pnl: number;
      realized_pnl: number;
      dividend_income: number;
      total_pnl: number;
      return_rate: number;
      cumulative_buy_fees: number;
      cumulative_sell_fees: number;
      cumulative_withholding_tax: number;
      cumulative_total_fees: number;
    };
  };
}

describe("Portfolio Summary", () => {
  it("[UC-PORTFOLIO-006-S01] calculates all metrics correctly", async () => {
    await seedBuy("AAPL", 100, 150, 5);
    await seedBuy("TSLA", 50, 100, 3);
    await db
      .prepare(
        "INSERT INTO prices (symbol, price, updated_at) VALUES ('AAPL', 180, '2024-03-01'), ('TSLA', 90, '2024-03-01')",
      )
      .run();

    const { data } = await getSummary();
    expect(data.total_investment).toBe(15005 + 5003);
    expect(data.total_market_value).toBe(18000 + 4500);
    expect(data.unrealized_pnl).toBeCloseTo(2500, 0);
    expect(data.realized_pnl).toBe(0);
    expect(data.total_pnl).toBeCloseTo(2500, 0);
  });

  it("[UC-PORTFOLIO-006-S02] includes realized P&L from sells", async () => {
    await seedBuy("MSFT", 100, 200, 5);
    const lotRow = await db.prepare("SELECT id FROM lots").first<{ id: number }>();
    await seedSell("MSFT", 50, 220, 5, lotRow!.id, 50);
    await db
      .prepare("INSERT INTO prices (symbol, price, updated_at) VALUES ('MSFT', 220, '2024-03-01')")
      .run();

    const { data } = await getSummary();
    expect(data.realized_pnl).toBeGreaterThan(0);
  });

  it("[UC-PORTFOLIO-006-S03] includes dividend income", async () => {
    await db
      .prepare(
        "INSERT INTO transactions (portfolio_id, symbol, type, quantity, price, fee, date) VALUES (?, 'AAPL', 'dividend', 0, 100, 30, '2024-04-01')",
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
    expect(data.total_market_value).toBe(0);
    expect(data.unrealized_pnl).toBe(0);
    expect(data.realized_pnl).toBe(0);
    expect(data.dividend_income).toBe(0);
    expect(data.total_pnl).toBe(0);
  });
});
