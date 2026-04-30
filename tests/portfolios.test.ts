import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPlatformProxy, unstable_dev } from "wrangler";
import type { UnstableDevWorker } from "wrangler";

let worker: UnstableDevWorker;
let db: D1Database;
let userId: number;

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
  await db.exec("DELETE FROM api_tokens");
  await db.exec("DELETE FROM portfolios");
  await db.exec("DELETE FROM users");
  const result = await db
    .prepare("INSERT INTO users (email) VALUES (?) RETURNING id")
    .bind("test@example.com")
    .first<{ id: number }>();
  userId = result!.id;
});

function authHeaders(email = "test@example.com"): Record<string, string> {
  return { "CF-Access-Authenticated-User-Email": email };
}

describe("Portfolio CRUD", () => {
  it("[UC-PORTFOLIO-001-S01] creates portfolio and returns it", async () => {
    const res = await worker.fetch("http://localhost/api/portfolios", {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "US Stocks", currency: "USD" }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      data: { id: number; name: string; currency: string; archived: number };
    };
    expect(body.data.name).toBe("US Stocks");
    expect(body.data.currency).toBe("USD");
    expect(body.data.archived).toBe(0);

    const row = await db
      .prepare("SELECT id FROM portfolios WHERE name = ? AND user_id = ?")
      .bind("US Stocks", userId)
      .first();
    expect(row).not.toBeNull();
  });

  it("[UC-PORTFOLIO-001-S02] returns 409 for duplicate name", async () => {
    await worker.fetch("http://localhost/api/portfolios", {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "HK Stocks", currency: "HKD" }),
    });

    const res = await worker.fetch("http://localhost/api/portfolios", {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "HK Stocks", currency: "HKD" }),
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("already exists");
  });

  it("[UC-PORTFOLIO-001-S03] lists all user portfolios", async () => {
    await worker.fetch("http://localhost/api/portfolios", {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "US Stocks", currency: "USD" }),
    });
    await worker.fetch("http://localhost/api/portfolios", {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "HK Stocks", currency: "HKD" }),
    });

    const res = await worker.fetch("http://localhost/api/portfolios", {
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Array<{ name: string; currency: string }> };
    expect(body.data).toHaveLength(2);
    expect(body.data.map((p) => p.name)).toEqual(
      expect.arrayContaining(["US Stocks", "HK Stocks"]),
    );
  });

  it("[UC-PORTFOLIO-001-S04] returns 401 when unauthenticated", async () => {
    const res = await worker.fetch("http://localhost/api/portfolios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "US Stocks", currency: "USD" }),
    });
    expect(res.status).toBe(401);
  });
});
