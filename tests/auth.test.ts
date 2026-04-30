import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPlatformProxy, unstable_dev } from "wrangler";
import type { UnstableDevWorker } from "wrangler";
import { cleanDatabase } from "./helpers";

let worker: UnstableDevWorker;
let db: D1Database;

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
});

describe("Auth Middleware", () => {
  it("[UC-AUTH-002-S01] authenticates via CF-Access-Authenticated-User-Email header", async () => {
    const res = await worker.fetch("http://localhost/api/me", {
      headers: { "CF-Access-Authenticated-User-Email": "user@example.com" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { id: number; email: string } };
    expect(body.data.email).toBe("user@example.com");
    expect(body.data.id).toBeGreaterThan(0);
  });

  it("[UC-AUTH-002-S02] authenticates via Bearer token", async () => {
    const userResult = await db
      .prepare("INSERT INTO users (email) VALUES (?) RETURNING id")
      .bind("token-user@example.com")
      .first<{ id: number }>();
    const userId = userResult!.id;

    const rawToken = crypto.randomUUID();
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(rawToken));
    const tokenHash = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    await db
      .prepare("INSERT INTO api_tokens (user_id, name, token_hash) VALUES (?, ?, ?)")
      .bind(userId, "Test Token", tokenHash)
      .run();

    const res = await worker.fetch("http://localhost/api/me", {
      headers: { Authorization: `Bearer ${rawToken}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { id: number; email: string } };
    expect(body.data.email).toBe("token-user@example.com");

    const tokenRow = await db
      .prepare("SELECT last_used_at FROM api_tokens WHERE user_id = ?")
      .bind(userId)
      .first<{ last_used_at: string | null }>();
    expect(tokenRow!.last_used_at).not.toBeNull();
  });

  it("[UC-AUTH-002-S03] Bearer token takes priority over CF header", async () => {
    const userResult = await db
      .prepare("INSERT INTO users (email) VALUES (?) RETURNING id")
      .bind("token-user@example.com")
      .first<{ id: number }>();
    const userId = userResult!.id;

    const rawToken = crypto.randomUUID();
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(rawToken));
    const tokenHash = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    await db
      .prepare("INSERT INTO api_tokens (user_id, name, token_hash) VALUES (?, ?, ?)")
      .bind(userId, "Test Token", tokenHash)
      .run();

    const res = await worker.fetch("http://localhost/api/me", {
      headers: {
        "CF-Access-Authenticated-User-Email": "cf-user@example.com",
        Authorization: `Bearer ${rawToken}`,
      },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { id: number; email: string } };
    expect(body.data.email).toBe("token-user@example.com");
  });

  it("[UC-AUTH-002-S04] returns 401 when no auth header present", async () => {
    const res = await worker.fetch("http://localhost/api/me");
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Unauthorized");
  });

  it("[UC-AUTH-002-S05] returns 401 for invalid Bearer token", async () => {
    const res = await worker.fetch("http://localhost/api/me", {
      headers: { Authorization: "Bearer invalid-token-12345" },
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Unauthorized");
  });

  it("[UC-AUTH-002-S06] auto-creates user on first auth via CF header", async () => {
    const email = "new-user@example.com";

    const userBefore = await db.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
    expect(userBefore).toBeNull();

    const res = await worker.fetch("http://localhost/api/me", {
      headers: { "CF-Access-Authenticated-User-Email": email },
    });
    expect(res.status).toBe(200);

    const userAfter = await db
      .prepare("SELECT id, email FROM users WHERE email = ?")
      .bind(email)
      .first<{ id: number; email: string }>();
    expect(userAfter).not.toBeNull();
    expect(userAfter!.email).toBe(email);
  });
});
