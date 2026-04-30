import { Hono } from "hono";
import type { AuthVariables } from "../middleware/auth";

type Bindings = {
  DB: D1Database;
};

const tokens = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>();

async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

tokens.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{ name?: string }>();

  if (!body.name || typeof body.name !== "string" || body.name.trim().length === 0) {
    return c.json({ error: "Name is required" }, 400);
  }

  const rawToken = crypto.randomUUID();
  const tokenHash = await sha256(rawToken);

  await c.env.DB.prepare("INSERT INTO api_tokens (user_id, name, token_hash) VALUES (?, ?, ?)")
    .bind(user.id, body.name.trim(), tokenHash)
    .run();

  return c.json({ data: { token: rawToken, name: body.name.trim() } }, 201);
});

tokens.get("/", async (c) => {
  const user = c.get("user");
  const rows = await c.env.DB.prepare(
    "SELECT id, name, created_at, last_used_at FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC",
  )
    .bind(user.id)
    .all<{ id: number; name: string; created_at: string; last_used_at: string | null }>();

  return c.json({ data: rows.results });
});

tokens.delete("/:id", async (c) => {
  const user = c.get("user");
  const tokenId = parseInt(c.req.param("id") ?? "", 10);
  if (isNaN(tokenId)) {
    return c.json({ error: "Invalid token ID" }, 400);
  }

  const token = await c.env.DB.prepare("SELECT id FROM api_tokens WHERE id = ? AND user_id = ?")
    .bind(tokenId, user.id)
    .first();
  if (!token) {
    return c.json({ error: "Token not found" }, 404);
  }

  await c.env.DB.prepare("DELETE FROM api_tokens WHERE id = ?").bind(tokenId).run();

  return c.json({ data: null });
});

export default tokens;
