import { Hono } from "hono";
import type { AuthVariables } from "../middleware/auth";
import type { Bindings } from "../types";

const tags = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>();

tags.post("/", async (c) => {
  const user = c.get("user");
  const portfolioId = parseInt(c.req.param("portfolioId") ?? "", 10);
  if (isNaN(portfolioId)) return c.json({ error: "Invalid portfolio ID" }, 400);

  const portfolio = await c.env.DB.prepare("SELECT id FROM portfolios WHERE id = ? AND user_id = ?")
    .bind(portfolioId, user.id)
    .first();
  if (!portfolio) return c.json({ error: "Portfolio not found" }, 404);

  const body = await c.req.json<{ name?: string }>();
  if (!body.name || typeof body.name !== "string" || body.name.trim().length === 0) {
    return c.json({ error: "Name is required" }, 400);
  }

  const existing = await c.env.DB.prepare("SELECT id FROM tags WHERE portfolio_id = ? AND name = ?")
    .bind(portfolioId, body.name.trim())
    .first();
  if (existing) return c.json({ error: "Tag already exists" }, 409);

  const result = await c.env.DB.prepare("INSERT INTO tags (portfolio_id, name) VALUES (?, ?)")
    .bind(portfolioId, body.name.trim())
    .run();

  const tag = await c.env.DB.prepare("SELECT id, portfolio_id, name FROM tags WHERE id = ?")
    .bind(result.meta.last_row_id)
    .first();

  return c.json({ data: tag }, 201);
});

tags.get("/", async (c) => {
  const user = c.get("user");
  const portfolioId = parseInt(c.req.param("portfolioId") ?? "", 10);
  if (isNaN(portfolioId)) return c.json({ error: "Invalid portfolio ID" }, 400);

  const portfolio = await c.env.DB.prepare("SELECT id FROM portfolios WHERE id = ? AND user_id = ?")
    .bind(portfolioId, user.id)
    .first();
  if (!portfolio) return c.json({ error: "Portfolio not found" }, 404);

  const rows = await c.env.DB.prepare("SELECT id, name FROM tags WHERE portfolio_id = ?")
    .bind(portfolioId)
    .all();

  return c.json({ data: rows.results });
});

tags.delete("/:tagId", async (c) => {
  const user = c.get("user");
  const portfolioId = parseInt(c.req.param("portfolioId") ?? "", 10);
  const tagId = parseInt(c.req.param("tagId") ?? "", 10);
  if (isNaN(portfolioId) || isNaN(tagId)) return c.json({ error: "Invalid ID" }, 400);

  const portfolio = await c.env.DB.prepare("SELECT id FROM portfolios WHERE id = ? AND user_id = ?")
    .bind(portfolioId, user.id)
    .first();
  if (!portfolio) return c.json({ error: "Portfolio not found" }, 404);

  const tag = await c.env.DB.prepare("SELECT id FROM tags WHERE id = ? AND portfolio_id = ?")
    .bind(tagId, portfolioId)
    .first();
  if (!tag) return c.json({ error: "Tag not found" }, 404);

  await c.env.DB.prepare("DELETE FROM tags WHERE id = ?").bind(tagId).run();

  return c.json({ data: null });
});

tags.post("/:tagId/stocks", async (c) => {
  const user = c.get("user");
  const portfolioId = parseInt(c.req.param("portfolioId") ?? "", 10);
  const tagId = parseInt(c.req.param("tagId") ?? "", 10);
  if (isNaN(portfolioId) || isNaN(tagId)) return c.json({ error: "Invalid ID" }, 400);

  const portfolio = await c.env.DB.prepare("SELECT id FROM portfolios WHERE id = ? AND user_id = ?")
    .bind(portfolioId, user.id)
    .first();
  if (!portfolio) return c.json({ error: "Portfolio not found" }, 404);

  const tag = await c.env.DB.prepare("SELECT id FROM tags WHERE id = ? AND portfolio_id = ?")
    .bind(tagId, portfolioId)
    .first();
  if (!tag) return c.json({ error: "Tag not found" }, 404);

  const body = await c.req.json<{ symbol?: string }>();
  if (!body.symbol || typeof body.symbol !== "string") {
    return c.json({ error: "Symbol is required" }, 400);
  }

  await c.env.DB.prepare(
    "INSERT OR IGNORE INTO stock_tags (portfolio_id, symbol, tag_id) VALUES (?, ?, ?)",
  )
    .bind(portfolioId, body.symbol.trim(), tagId)
    .run();

  return c.json({ data: { symbol: body.symbol.trim(), tag_id: tagId } }, 201);
});

tags.delete("/:tagId/stocks/:symbol", async (c) => {
  const user = c.get("user");
  const portfolioId = parseInt(c.req.param("portfolioId") ?? "", 10);
  const tagId = parseInt(c.req.param("tagId") ?? "", 10);
  const symbol = c.req.param("symbol");
  if (isNaN(portfolioId) || isNaN(tagId) || !symbol)
    return c.json({ error: "Invalid parameters" }, 400);

  const portfolio = await c.env.DB.prepare("SELECT id FROM portfolios WHERE id = ? AND user_id = ?")
    .bind(portfolioId, user.id)
    .first();
  if (!portfolio) return c.json({ error: "Portfolio not found" }, 404);

  await c.env.DB.prepare(
    "DELETE FROM stock_tags WHERE portfolio_id = ? AND symbol = ? AND tag_id = ?",
  )
    .bind(portfolioId, symbol, tagId)
    .run();

  return c.json({ data: null });
});

export default tags;
