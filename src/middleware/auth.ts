import { createMiddleware } from "hono/factory";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { getCookie } from "hono/cookie";
import type { Bindings } from "../types";

export type AuthUser = {
  id: number;
  email: string;
};

export type AuthVariables = {
  user: AuthUser;
};

const DEFAULT_ACCESS_ISSUER = "https://fklj.cloudflareaccess.com";
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function getOrCreateUser(db: D1Database, email: string): Promise<AuthUser> {
  const existing = await db
    .prepare("SELECT id, email FROM users WHERE email = ?")
    .bind(email)
    .first<AuthUser>();
  if (existing) return existing;

  const result = await db.prepare("INSERT INTO users (email) VALUES (?)").bind(email).run();
  return { id: result.meta.last_row_id!, email };
}

function getJwks(jwksUrl: string): ReturnType<typeof createRemoteJWKSet> {
  const cached = jwksCache.get(jwksUrl);
  if (cached) return cached;

  const jwks = createRemoteJWKSet(new URL(jwksUrl));
  jwksCache.set(jwksUrl, jwks);
  return jwks;
}

function getAccessConfig(env: Bindings): {
  audience: string;
  issuer: string;
  jwksUrl: string;
} | null {
  if (!env.ACCESS_AUD) return null;

  const issuer = env.ACCESS_ISSUER ?? DEFAULT_ACCESS_ISSUER;
  return {
    audience: env.ACCESS_AUD,
    issuer,
    jwksUrl: env.ACCESS_JWKS_URL ?? `${issuer}/cdn-cgi/access/certs`,
  };
}

async function authenticateBearer(
  db: D1Database,
  authHeader: string | undefined,
): Promise<AuthUser | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  const tokenHash = await sha256(token);
  const tokenRow = await db
    .prepare("SELECT id, user_id FROM api_tokens WHERE token_hash = ?")
    .bind(tokenHash)
    .first<{ id: number; user_id: number }>();

  if (!tokenRow) return null;

  await db
    .prepare("UPDATE api_tokens SET last_used_at = datetime('now') WHERE id = ?")
    .bind(tokenRow.id)
    .run();

  return db
    .prepare("SELECT id, email FROM users WHERE id = ?")
    .bind(tokenRow.user_id)
    .first<AuthUser>();
}

async function authenticateAccessJwt(
  db: D1Database,
  env: Bindings,
  accessJwt: string,
): Promise<AuthUser | null> {
  try {
    const config = getAccessConfig(env);
    if (!config) return null;

    const { payload } = await jwtVerify(accessJwt, getJwks(config.jwksUrl), {
      audience: config.audience,
      issuer: config.issuer,
    });
    const rawEmail = payload["email"];
    const email = typeof rawEmail === "string" ? rawEmail : null;
    if (!email) return null;
    return getOrCreateUser(db, email);
  } catch {
    return null;
  }
}

export const auth = createMiddleware<{ Bindings: Bindings; Variables: AuthVariables }>(
  async (c, next) => {
    const authHeader = c.req.header("Authorization");
    const bearerUser = await authenticateBearer(c.env.DB, authHeader);
    if (bearerUser) {
      c.set("user", bearerUser);
      return next();
    }

    const accessJwt = c.req.header("Cf-Access-Jwt-Assertion") ?? getCookie(c, "CF_Authorization");
    if (accessJwt) {
      const accessUser = await authenticateAccessJwt(c.env.DB, c.env, accessJwt);
      if (accessUser) {
        c.set("user", accessUser);
        return next();
      }
    }

    return c.json({ error: "Unauthorized" }, 401);
  },
);
