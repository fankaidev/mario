import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPlatformProxy, unstable_dev } from "wrangler";
import type { UnstableDevWorker } from "wrangler";
import { cleanDatabase, createApiTokenForUser } from "./helpers";
import { calculateSnapshot } from "../src/routes/snapshots";

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
    const res = await worker.fetch(`http://localhost/api/portfolios/${portfolioId}/snapshots`, {
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
    await worker.fetch(`http://localhost/api/portfolios/${portfolioId}/snapshots`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        date: "2024-12-31",
        total_investment: 100000,
        market_value: 120000,
        cash_balance: 5000,
      }),
    });

    const res = await worker.fetch(`http://localhost/api/portfolios/${portfolioId}/snapshots`, {
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
      await worker.fetch(`http://localhost/api/portfolios/${portfolioId}/snapshots`, {
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

    const res = await worker.fetch(`http://localhost/api/portfolios/${portfolioId}/snapshots`, {
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
    const createRes = await worker.fetch(
      `http://localhost/api/portfolios/${portfolioId}/snapshots`,
      {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          date: "2024-12-31",
          total_investment: 100000,
          market_value: 120000,
          cash_balance: 5000,
        }),
      },
    );
    const { data: snapshot } = (await createRes.json()) as { data: { id: number } };

    const delRes = await worker.fetch(
      `http://localhost/api/portfolios/${portfolioId}/snapshots/${snapshot.id}`,
      { method: "DELETE", headers: authHeaders() },
    );
    expect(delRes.status).toBe(200);

    const listRes = await worker.fetch(`http://localhost/api/portfolios/${portfolioId}/snapshots`, {
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

    const res = await worker.fetch(
      `http://localhost/api/portfolios/${otherPortfolioId}/snapshots`,
      {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          date: "2024-12-31",
          total_investment: 100000,
          market_value: 120000,
          cash_balance: 5000,
        }),
      },
    );
    expect(res.status).toBe(404);
  });
});

describe("Calculated Snapshots", () => {
  async function seedDeposit(amount: number, date = "2024-01-01") {
    await db
      .prepare(
        "INSERT INTO transfers (portfolio_id, type, amount, fee, date) VALUES (?, 'deposit', ?, 0, ?)",
      )
      .bind(portfolioId, amount, date)
      .run();
  }

  async function seedBuy(
    symbol: string,
    quantity: number,
    price: number,
    fee: number,
    date = "2024-01-15",
  ) {
    const txResult = await db
      .prepare(
        "INSERT INTO transactions (portfolio_id, symbol, type, quantity, price, fee, date) VALUES (?, ?, 'buy', ?, ?, ?, ?)",
      )
      .bind(portfolioId, symbol, quantity, price, fee, date)
      .run();
    await db
      .prepare(
        "INSERT INTO lots (transaction_id, portfolio_id, symbol, quantity, remaining_quantity, cost_basis) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .bind(txResult.meta.last_row_id, portfolioId, symbol, quantity, quantity, quantity * price)
      .run();
  }

  async function seedSell(
    symbol: string,
    quantity: number,
    price: number,
    fee: number,
    lotId: number,
    sellQty: number,
    date = "2024-06-01",
  ) {
    const txResult = await db
      .prepare(
        "INSERT INTO transactions (portfolio_id, symbol, type, quantity, price, fee, date) VALUES (?, ?, 'sell', ?, ?, ?, ?)",
      )
      .bind(portfolioId, symbol, quantity, price, fee, date)
      .run();
    await db
      .prepare(
        "INSERT INTO realized_pnl (sell_transaction_id, lot_id, quantity, proceeds, cost, pnl) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .bind(
        txResult.meta.last_row_id,
        lotId,
        sellQty,
        sellQty * price,
        sellQty * 150,
        sellQty * (price - 150),
      )
      .run();
    await db
      .prepare("UPDATE lots SET remaining_quantity = remaining_quantity - ? WHERE id = ?")
      .bind(sellQty, lotId)
      .run();
  }

  async function seedPrice(symbol: string, date: string, close: number) {
    await db
      .prepare("INSERT INTO price_history (symbol, date, close) VALUES (?, ?, ?)")
      .bind(symbol, date, close)
      .run();
  }

  it("[UC-PORTFOLIO-008-S06] calculates snapshot from transactions and price_history", async () => {
    await seedDeposit(20000);
    await seedBuy("AAPL", 100, 150, 5, "2024-01-15");
    await seedPrice("AAPL", "2024-03-01", 180);

    const res = await worker.fetch(
      `http://localhost/api/portfolios/${portfolioId}/snapshots/calculate`,
      {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ date: "2024-03-01" }),
      },
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      data: { total_investment: number; market_value: number; cash_balance: number };
    };
    expect(body.data.total_investment).toBe(20000);
    expect(body.data.market_value).toBe(18000);
    expect(body.data.cash_balance).toBe(20000 - 15005);
  });

  it("[UC-PORTFOLIO-008-S07] returns 422 when price_history missing", async () => {
    await seedDeposit(20000);
    await seedBuy("AAPL", 100, 150, 5, "2024-01-15");

    const res = await worker.fetch(
      `http://localhost/api/portfolios/${portfolioId}/snapshots/calculate`,
      {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ date: "2024-03-01" }),
      },
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("AAPL");
  });

  it("[UC-PORTFOLIO-008-S09] rejects future date", async () => {
    const res = await worker.fetch(
      `http://localhost/api/portfolios/${portfolioId}/snapshots/calculate`,
      {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ date: "2099-12-31" }),
      },
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("future");
  });

  it("[UC-PORTFOLIO-008-S10] returns 409 if snapshot exists for date", async () => {
    await worker.fetch(`http://localhost/api/portfolios/${portfolioId}/snapshots`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        date: "2024-03-01",
        total_investment: 20000,
        market_value: 18000,
        cash_balance: 4995,
      }),
    });

    await seedDeposit(20000);
    await seedBuy("AAPL", 100, 150, 5, "2024-01-15");
    await seedPrice("AAPL", "2024-03-01", 180);

    const res = await worker.fetch(
      `http://localhost/api/portfolios/${portfolioId}/snapshots/calculate`,
      {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ date: "2024-03-01" }),
      },
    );
    expect(res.status).toBe(409);
  });

  it("[UC-PORTFOLIO-008-S11] calculates market_value after partial sells", async () => {
    await seedDeposit(30000);
    await seedBuy("AAPL", 100, 150, 5, "2024-01-15");

    const lotRow = await db.prepare("SELECT id FROM lots").first<{ id: number }>();
    await seedSell("AAPL", 50, 200, 5, lotRow!.id, 50, "2024-06-01");

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

    const res = await worker.fetch(
      `http://localhost/api/portfolios/${otherPortfolioId}/snapshots/calculate`,
      {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ date: "2024-03-01" }),
      },
    );
    expect(res.status).toBe(404);
  });
});
