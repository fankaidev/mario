import { Hono } from "hono";
import type { AuthVariables } from "../middleware/auth";
import type { Portfolio } from "../../shared/types/api";

type Bindings = {
  DB: D1Database;
};

const portfolios = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>();

portfolios.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{ name?: string; currency?: string }>();

  if (!body.name || typeof body.name !== "string" || body.name.trim().length === 0) {
    return c.json({ error: "Name is required" }, 400);
  }
  if (!body.currency || !["USD", "HKD", "CNY"].includes(body.currency)) {
    return c.json({ error: "Currency must be USD, HKD, or CNY" }, 400);
  }

  const existing = await c.env.DB.prepare(
    "SELECT id FROM portfolios WHERE user_id = ? AND name = ?",
  )
    .bind(user.id, body.name.trim())
    .first();
  if (existing) {
    return c.json({ error: "Portfolio with this name already exists" }, 409);
  }

  const result = await c.env.DB.prepare(
    "INSERT INTO portfolios (user_id, name, currency) VALUES (?, ?, ?)",
  )
    .bind(user.id, body.name.trim(), body.currency)
    .run();

  const portfolio = await c.env.DB.prepare(
    "SELECT id, user_id, name, currency, created_at, archived FROM portfolios WHERE id = ?",
  )
    .bind(result.meta.last_row_id)
    .first<Portfolio>();

  return c.json({ data: portfolio }, 201);
});

portfolios.get("/", async (c) => {
  const user = c.get("user");
  const rows = await c.env.DB.prepare(
    "SELECT id, user_id, name, currency, created_at, archived FROM portfolios WHERE user_id = ? ORDER BY created_at DESC",
  )
    .bind(user.id)
    .all<Portfolio>();

  return c.json({ data: rows.results });
});

portfolios.get("/:id", async (c) => {
  const user = c.get("user");
  const id = parseInt(c.req.param("id"), 10);
  if (isNaN(id)) {
    return c.json({ error: "Invalid portfolio ID" }, 400);
  }

  const portfolio = await c.env.DB.prepare(
    "SELECT id, user_id, name, currency, created_at, archived FROM portfolios WHERE id = ? AND user_id = ?",
  )
    .bind(id, user.id)
    .first<Portfolio>();

  if (!portfolio) {
    return c.json({ error: "Portfolio not found" }, 404);
  }

  return c.json({ data: portfolio });
});

export default portfolios;
