import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPlatformProxy, unstable_dev } from "wrangler";
import type { UnstableDevWorker } from "wrangler";
import { cleanDatabase, createApiTokenForUser } from "./helpers";
import type { PortfolioSummary } from "../shared/types/api";

let worker: UnstableDevWorker;
let db: D1Database;
let portfolioId: number;
let authToken: string;

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

async function seedDeposit(amount: number) {
  await db
    .prepare(
      "INSERT INTO transfers (portfolio_id, type, amount, fee, date) VALUES (?, 'deposit', ?, 0, '2024-01-01')",
    )
    .bind(portfolioId, amount)
    .run();
}

async function seedWithdrawal(amount: number) {
  await db
    .prepare(
      "INSERT INTO transfers (portfolio_id, type, amount, fee, date) VALUES (?, 'withdrawal', ?, 0, '2024-01-01')",
    )
    .bind(portfolioId, amount)
    .run();
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
    .bind(txRes.meta.last_row_id, portfolioId, symbol, quantity, quantity, quantity * price + fee)
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
  const proceeds = price * consumed - fee * (consumed / quantity);
  const pnl = proceeds - cost;
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
    data: PortfolioSummary;
  };
}

describe("Portfolio Summary", () => {
  it("[UC-PORTFOLIO-006-S01] calculates all metrics correctly", async () => {
    await seedDeposit(20000);
    await seedBuy("AAPL", 100, 150, 5);
    await seedBuy("TSLA", 50, 100, 3);
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
    expect(data.return_rate).toBeCloseTo((2492 / 20000) * 100, 0);
  });

  it("[UC-PORTFOLIO-006-S02] includes realized P&L from sells", async () => {
    await seedDeposit(25000);
    await seedBuy("MSFT", 100, 200, 5);
    const lotRow = await db.prepare("SELECT id FROM lots").first<{ id: number }>();
    await seedSell("MSFT", 50, 220, 5, lotRow!.id, 50);
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
    await seedDeposit(50000);
    await seedDeposit(20000);
    await seedWithdrawal(10000);

    const { data } = await getSummary();
    expect(data.total_investment).toBe(60000);
  });

  it("[UC-PORTFOLIO-006-S09] includes cash balance in portfolio value", async () => {
    // Deposit enough to have 198000 cash after buying AAPL (15005) and TSLA (5003)
    // 198000 + 15005 + 5003 = 218008
    await seedDeposit(218008);
    await seedBuy("AAPL", 100, 150, 5);
    await seedBuy("TSLA", 50, 100, 3);
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
    await seedDeposit(20000);
    await seedBuy("AAPL", 100, 150, 5);
    await seedBuy("TSLA", 50, 100, 3);
    await db
      .prepare(
        "INSERT INTO price_history (symbol, date, close) VALUES ('AAPL', '2024-03-01', 180), ('TSLA', '2024-03-02', 90)",
      )
      .run();

    const { data } = await getSummary();
    expect(data.price_updated_at).toBe("2024-03-01");
  });

  it("[UC-PORTFOLIO-006-S10b] returns null price_updated_at when no holdings", async () => {
    await seedDeposit(20000);

    const { data } = await getSummary();
    expect(data.price_updated_at).toBeNull();
  });
});
