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
  it("[UC-PORTFOLIO-003-S01] creates a snapshot", async () => {
    const res = await worker.fetch(`http://localhost/api/portfolios/${portfolioId}/snapshots`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        date: "2024-12-31",
        total_investment: 100000,
        market_value: 120000,
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
        note: string | null;
      };
    };
    expect(body.data.date).toBe("2024-12-31");
    expect(body.data.total_investment).toBe(100000);
    expect(body.data.market_value).toBe(120000);
    expect(body.data.note).toBe("Year end");
    expect(body.data.id).toBeGreaterThan(0);
  });

  it("[UC-PORTFOLIO-003-S02] rejects duplicate date", async () => {
    await worker.fetch(`http://localhost/api/portfolios/${portfolioId}/snapshots`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ date: "2024-12-31", total_investment: 100000, market_value: 120000 }),
    });

    const res = await worker.fetch(`http://localhost/api/portfolios/${portfolioId}/snapshots`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ date: "2024-12-31", total_investment: 110000, market_value: 130000 }),
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("already exists");
  });

  it("[UC-PORTFOLIO-003-S03] lists snapshots sorted by date DESC", async () => {
    const dates = ["2024-01-15", "2024-06-30", "2024-12-31"];
    for (const date of dates) {
      await worker.fetch(`http://localhost/api/portfolios/${portfolioId}/snapshots`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ date, total_investment: 100000, market_value: 120000 }),
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

  it("[UC-PORTFOLIO-003-S04] deletes a snapshot", async () => {
    const createRes = await worker.fetch(
      `http://localhost/api/portfolios/${portfolioId}/snapshots`,
      {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          date: "2024-12-31",
          total_investment: 100000,
          market_value: 120000,
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

  it("[UC-PORTFOLIO-003-S05] returns 404 for other user's portfolio", async () => {
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
        }),
      },
    );
    expect(res.status).toBe(404);
  });
});
