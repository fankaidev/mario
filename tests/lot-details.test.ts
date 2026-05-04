import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPlatformProxy, unstable_dev } from "wrangler";
import type { UnstableDevWorker } from "wrangler";
import { cleanDatabase, createApiTokenForUser } from "./helpers";

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

async function makeBuy(symbol: string, quantity: number, price: number, fee: number, date: string) {
  const res = await worker.fetch(`http://localhost/api/portfolios/${portfolioId}/transactions`, {
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
  date: string,
) {
  const res = await worker.fetch(`http://localhost/api/portfolios/${portfolioId}/transactions`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ symbol, type: "sell", quantity, price, fee, date }),
  });
  return (await res.json()) as { data: { id: number } };
}

describe("View Lot Details", () => {
  it("[UC-PORTFOLIO-012-S01] returns lot details with P&L correctly", async () => {
    await makeBuy("AAPL", 20, 150, 0, "2024-01-01");
    await makeBuy("AAPL", 50, 160, 0, "2024-02-01");
    // Don't sell anything - keep both lots open
    await db
      .prepare("INSERT INTO price_history (symbol, date, close) VALUES (?, ?, ?)")
      .bind("AAPL", "2024-03-01", 180)
      .run();

    const res = await worker.fetch(
      `http://localhost/api/portfolios/${portfolioId}/holdings/AAPL/lots`,
      { headers: authHeaders() },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: {
        symbol: string;
        name: string;
        total_quantity: number;
        lots: Array<{
          id: number;
          date: string;
          buy_price: number;
          quantity: number;
          remaining_quantity: number;
          cost_basis: number;
          current_value: number | null;
          unrealized_pnl: number | null;
          unrealized_pnl_rate: number | null;
          status: string;
        }>;
      };
    };

    expect(body.data.symbol).toBe("AAPL");
    expect(body.data.total_quantity).toBe(70); // 20 + 50
    expect(body.data.lots).toHaveLength(2);

    const lot1 = body.data.lots[0]!;
    expect(lot1.date).toBe("2024-01-01");
    expect(lot1.buy_price).toBe(150);
    expect(lot1.quantity).toBe(20);
    expect(lot1.remaining_quantity).toBe(20);
    expect(lot1.cost_basis).toBe(3000);
    expect(lot1.current_value).toBe(3600);
    expect(lot1.unrealized_pnl).toBe(600);
    expect(lot1.unrealized_pnl_rate).toBe(20);
    expect(lot1.status).toBe("open");

    const lot2 = body.data.lots[1]!;
    expect(lot2.date).toBe("2024-02-01");
    expect(lot2.buy_price).toBe(160);
    expect(lot2.quantity).toBe(50);
    expect(lot2.remaining_quantity).toBe(50);
    expect(lot2.cost_basis).toBe(8000);
    expect(lot2.current_value).toBe(9000);
    expect(lot2.unrealized_pnl).toBe(1000);
    expect(lot2.unrealized_pnl_rate).toBe(12.5);
    expect(lot2.status).toBe("open");
  });

  it("[UC-PORTFOLIO-012-S02] shows closed status for fully sold lots", async () => {
    await makeBuy("AAPL", 100, 150, 0, "2024-01-01");
    await makeSell("AAPL", 100, 160, 0, "2024-01-15");

    const res = await worker.fetch(
      `http://localhost/api/portfolios/${portfolioId}/holdings/AAPL/lots`,
      { headers: authHeaders() },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { lots: Array<{ status: string }> };
    };
    expect(body.data.lots[0]!.status).toBe("closed");
  });

  it("[UC-PORTFOLIO-012-S03] shows null P&L when price missing", async () => {
    await makeBuy("AAPL", 100, 150, 0, "2024-01-01");

    const res = await worker.fetch(
      `http://localhost/api/portfolios/${portfolioId}/holdings/AAPL/lots`,
      { headers: authHeaders() },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: {
        lots: Array<{
          current_value: number | null;
          unrealized_pnl: number | null;
          unrealized_pnl_rate: number | null;
        }>;
      };
    };
    expect(body.data.lots[0]!.current_value).toBeNull();
    expect(body.data.lots[0]!.unrealized_pnl).toBeNull();
    expect(body.data.lots[0]!.unrealized_pnl_rate).toBeNull();
  });

  it("[UC-PORTFOLIO-012-S04] returns 404 for other user's portfolio", async () => {
    const otherUser = await db
      .prepare("INSERT INTO users (email) VALUES (?) RETURNING id")
      .bind("other@example.com")
      .first<{ id: number }>();
    const otherPortfolio = await db
      .prepare("INSERT INTO portfolios (user_id, name, currency) VALUES (?, ?, ?) RETURNING id")
      .bind(otherUser!.id, "Other Portfolio", "USD")
      .first<{ id: number }>();

    const res = await worker.fetch(
      `http://localhost/api/portfolios/${otherPortfolio!.id}/holdings/AAPL/lots`,
      { headers: authHeaders() },
    );
    expect(res.status).toBe(404);
  });

  it("[UC-PORTFOLIO-012-S05] returns empty lots for symbol with no lots", async () => {
    const res = await worker.fetch(
      `http://localhost/api/portfolios/${portfolioId}/holdings/UNKNOWN/lots`,
      { headers: authHeaders() },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { symbol: string; lots: unknown[]; total_quantity: number };
    };
    expect(body.data.symbol).toBe("UNKNOWN");
    expect(body.data.lots).toHaveLength(0);
    expect(body.data.total_quantity).toBe(0);
  });
});
