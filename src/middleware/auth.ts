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

const ACCESS_URL = "https://fklj.cloudflareaccess.com";
const JWKS = createRemoteJWKSet(new URL(`${ACCESS_URL}/cdn-cgi/access/certs`));

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

async function authenticateBearer(db: D1Database, authHeader: string): Promise<AuthUser | null> {
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

async function authenticateCookie(db: D1Database, cookie: string): Promise<AuthUser | null> {
  try {
    const { payload } = await jwtVerify(cookie, JWKS, {
      issuer: ACCESS_URL,
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
    const bearerUser = authHeader ? await authenticateBearer(c.env.DB, authHeader) : null;
    if (bearerUser) {
      c.set("user", bearerUser);
      return next();
    }

    const cfAuthCookie = getCookie(c, "CF_Authorization");
    if (cfAuthCookie) {
      const cookieUser = await authenticateCookie(c.env.DB, cfAuthCookie);
      if (cookieUser) {
        c.set("user", cookieUser);
        return next();
      }
    }

    const cfEmail = c.req.header("CF-Access-Authenticated-User-Email");
    if (cfEmail) {
      const user = await getOrCreateUser(c.env.DB, cfEmail);
      c.set("user", user);
      return next();
    }

    return c.json({ error: "Unauthorized" }, 401);
  },
);
