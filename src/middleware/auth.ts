import { createMiddleware } from "hono/factory";
import type { Bindings } from "../types";

export type AuthUser = {
  id: number;
  email: string;
};

export type AuthVariables = {
  user: AuthUser;
};

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

export const auth = createMiddleware<{ Bindings: Bindings; Variables: AuthVariables }>(
  async (c, next) => {
    const cfEmail = c.req.header("CF-Access-Authenticated-User-Email");
    if (cfEmail) {
      const user = await getOrCreateUser(c.env.DB, cfEmail);
      c.set("user", user);
      return next();
    }

    const authHeader = c.req.header("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const tokenHash = await sha256(token);
      const tokenRow = await c.env.DB.prepare(
        "SELECT id, user_id FROM api_tokens WHERE token_hash = ?",
      )
        .bind(tokenHash)
        .first<{ id: number; user_id: number }>();

      if (tokenRow) {
        await c.env.DB.prepare("UPDATE api_tokens SET last_used_at = datetime('now') WHERE id = ?")
          .bind(tokenRow.id)
          .run();

        const user = await c.env.DB.prepare("SELECT id, email FROM users WHERE id = ?")
          .bind(tokenRow.user_id)
          .first<AuthUser>();

        if (user) {
          c.set("user", user);
          return next();
        }
      }
    }

    return c.json({ error: "Unauthorized" }, 401);
  },
);
