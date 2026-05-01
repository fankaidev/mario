import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { exportJWK, generateKeyPair, SignJWT, type JWK, type KeyLike } from "jose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPlatformProxy, unstable_dev } from "wrangler";
import type { UnstableDevWorker } from "wrangler";
import { cleanDatabase } from "./helpers";

let worker: UnstableDevWorker;
let db: D1Database;
let jwksServer: Server;
let jwksUrl: string;
let accessPrivateKey: KeyLike;

const ACCESS_KEY_ID = "test-access-key";
const TEST_ACCESS_AUD = "test-access-audience";
const TEST_ACCESS_ISSUER = "https://test.cloudflareaccess.com";

async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(input));
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function createApiToken(email: string): Promise<string> {
  const userResult = await db
    .prepare("INSERT INTO users (email) VALUES (?) RETURNING id")
    .bind(email)
    .first<{ id: number }>();
  const userId = userResult!.id;

  const rawToken = crypto.randomUUID();
  await db
    .prepare("INSERT INTO api_tokens (user_id, name, token_hash) VALUES (?, ?, ?)")
    .bind(userId, "Test Token", await sha256(rawToken))
    .run();

  return rawToken;
}

async function createAccessJwt(email: string): Promise<string> {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: "RS256", kid: ACCESS_KEY_ID })
    .setIssuer(TEST_ACCESS_ISSUER)
    .setAudience(TEST_ACCESS_AUD)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(accessPrivateKey);
}

beforeAll(async () => {
  const { publicKey, privateKey } = await generateKeyPair("RS256", { extractable: true });
  accessPrivateKey = privateKey;
  const publicJwk: JWK = {
    ...(await exportJWK(publicKey)),
    alg: "RS256",
    kid: ACCESS_KEY_ID,
    use: "sig",
  };

  jwksServer = createServer((_req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ keys: [publicJwk] }));
  });
  await new Promise<void>((resolve) => jwksServer.listen(0, "127.0.0.1", resolve));
  const address = jwksServer.address() as AddressInfo;
  jwksUrl = `http://127.0.0.1:${address.port}/cdn-cgi/access/certs`;

  const { env } = await getPlatformProxy<{ DB: D1Database }>();
  db = env.DB;
  worker = await unstable_dev("src/index.ts", {
    config: "wrangler.toml",
    local: true,
    vars: {
      ACCESS_AUD: TEST_ACCESS_AUD,
      ACCESS_ISSUER: TEST_ACCESS_ISSUER,
      ACCESS_JWKS_URL: jwksUrl,
    },
  });
});

afterAll(async () => {
  await worker.stop();
  await new Promise<void>((resolve, reject) => {
    jwksServer.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
});

beforeEach(async () => {
  await cleanDatabase(db);
});

describe("Auth Middleware", () => {
  it("[UC-AUTH-002-S02] authenticates via Bearer token", async () => {
    const rawToken = await createApiToken("token-user@example.com");

    const res = await worker.fetch("http://localhost/api/me", {
      headers: { Authorization: `Bearer ${rawToken}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { id: number; email: string } };
    expect(body.data.email).toBe("token-user@example.com");

    const tokenRow = await db
      .prepare(
        "SELECT t.last_used_at FROM api_tokens t JOIN users u ON t.user_id = u.id WHERE u.email = ?",
      )
      .bind("token-user@example.com")
      .first<{ last_used_at: string | null }>();
    expect(tokenRow!.last_used_at).not.toBeNull();
  });

  it("[UC-AUTH-002-S03] Bearer token takes priority over Access JWT", async () => {
    const rawToken = await createApiToken("token-user@example.com");
    const accessJwt = await createAccessJwt("access-user@example.com");

    const res = await worker.fetch("http://localhost/api/me", {
      headers: {
        Authorization: `Bearer ${rawToken}`,
        "Cf-Access-Jwt-Assertion": accessJwt,
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

  it("[UC-AUTH-002-S07] authenticates via verified Access JWT header", async () => {
    const accessJwt = await createAccessJwt("access-user@example.com");

    const res = await worker.fetch("http://localhost/api/me", {
      headers: { "Cf-Access-Jwt-Assertion": accessJwt },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { id: number; email: string } };
    expect(body.data.email).toBe("access-user@example.com");
    expect(body.data.id).toBeGreaterThan(0);
  });

  it("[UC-AUTH-002-S08] rejects spoofed CF-Access-Authenticated-User-Email header", async () => {
    const res = await worker.fetch("http://localhost/api/me", {
      headers: { "CF-Access-Authenticated-User-Email": "user@example.com" },
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Unauthorized");
  });

  it("[UC-AUTH-002-S09] auto-creates user on first auth via verified Access JWT", async () => {
    const email = "new-user@example.com";

    const userBefore = await db.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
    expect(userBefore).toBeNull();

    const accessJwt = await createAccessJwt(email);
    const res = await worker.fetch("http://localhost/api/me", {
      headers: { Cookie: `CF_Authorization=${accessJwt}` },
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
