import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPlatformProxy, unstable_dev } from "wrangler";
import type { UnstableDevWorker } from "wrangler";
import { cleanDatabase } from "./helpers";

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
  await cleanDatabase(db);
  const result = await db
    .prepare("INSERT INTO users (email) VALUES (?) RETURNING id")
    .bind("test@example.com")
    .first<{ id: number }>();
  userId = result!.id;
});

function authHeaders(email = "test@example.com"): Record<string, string> {
  return { "CF-Access-Authenticated-User-Email": email };
}

function apiHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

describe("API Token Management", () => {
  it("[UC-AUTH-001-S01] creates token and returns raw token once", async () => {
    const res = await worker.fetch("http://localhost/api/tokens", {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "CLI Tool" }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { token: string; name: string } };
    expect(body.data.name).toBe("CLI Tool");
    expect(typeof body.data.token).toBe("string");
    expect(body.data.token.length).toBeGreaterThan(0);

    const rows = await db
      .prepare("SELECT token_hash FROM api_tokens WHERE user_id = ?")
      .bind(userId)
      .all<{ token_hash: string }>();
    expect(rows.results).toHaveLength(1);
    expect(rows.results[0].token_hash).not.toBe(body.data.token);
  });

  it("[UC-AUTH-001-S02] lists tokens without raw token", async () => {
    await worker.fetch("http://localhost/api/tokens", {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "CLI Tool" }),
    });

    const res = await worker.fetch("http://localhost/api/tokens", {
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: Array<{ name: string; created_at: string; token_hash?: string }>;
    };
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe("CLI Tool");
    expect(body.data[0].token_hash).toBeUndefined();
  });

  it("[UC-AUTH-001-S04] revoked token returns 401", async () => {
    const createRes = await worker.fetch("http://localhost/api/tokens", {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "CLI Tool" }),
    });
    const {
      data: { token: rawToken },
    } = (await createRes.json()) as { data: { token: string } };

    const tokenRow = await db
      .prepare("SELECT id FROM api_tokens WHERE user_id = ?")
      .bind(userId)
      .first<{ id: number }>();

    await worker.fetch(`http://localhost/api/tokens/${tokenRow!.id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });

    const res = await worker.fetch("http://localhost/api/me", {
      headers: apiHeaders(rawToken),
    });
    expect(res.status).toBe(401);
  });

  it("[UC-AUTH-001-S06] revoking one token does not affect others", async () => {
    const res1 = await worker.fetch("http://localhost/api/tokens", {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Token A" }),
    });
    const {
      data: { token: tokenA },
    } = (await res1.json()) as { data: { token: string } };

    const res2 = await worker.fetch("http://localhost/api/tokens", {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Token B" }),
    });
    const {
      data: { token: tokenB },
    } = (await res2.json()) as { data: { token: string } };

    const rows = await db
      .prepare("SELECT id FROM api_tokens WHERE user_id = ? ORDER BY id")
      .bind(userId)
      .all<{ id: number }>();
    await worker.fetch(`http://localhost/api/tokens/${rows.results[0].id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });

    const resA = await worker.fetch("http://localhost/api/me", { headers: apiHeaders(tokenA) });
    expect(resA.status).toBe(401);

    const resB = await worker.fetch("http://localhost/api/me", { headers: apiHeaders(tokenB) });
    expect(resB.status).toBe(200);
  });
});
