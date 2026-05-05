import { Hono } from "hono";
import type { AuthVariables } from "../middleware/auth";
import type { Bindings } from "../types";

const corporateActions = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>();

corporateActions.get("/", async (c) => {
  const user = c.get("user");
  const portfolioId = parseInt(c.req.param("portfolioId") ?? "", 10);
  if (isNaN(portfolioId)) return c.json({ error: "Invalid portfolio ID" }, 400);

  const portfolio = await c.env.DB.prepare(
    "SELECT id FROM portfolios WHERE id = ? AND user_id = ? AND deleted_at IS NULL",
  )
    .bind(portfolioId, user.id)
    .first();
  if (!portfolio) return c.json({ error: "Portfolio not found" }, 404);

  const actions = await c.env.DB.prepare(
    "SELECT id, portfolio_id, symbol, type, ratio, effective_date, created_at FROM corporate_actions WHERE portfolio_id = ? ORDER BY effective_date DESC, created_at DESC",
  )
    .bind(portfolioId)
    .all();

  return c.json({ data: actions.results });
});

corporateActions.post("/", async (c) => {
  const user = c.get("user");
  const portfolioId = parseInt(c.req.param("portfolioId") ?? "", 10);
  if (isNaN(portfolioId)) return c.json({ error: "Invalid portfolio ID" }, 400);

  const portfolio = await c.env.DB.prepare(
    "SELECT id FROM portfolios WHERE id = ? AND user_id = ? AND deleted_at IS NULL",
  )
    .bind(portfolioId, user.id)
    .first();
  if (!portfolio) return c.json({ error: "Portfolio not found" }, 404);

  const body = await c.req.json<{
    symbol?: string;
    type?: string;
    ratio?: number;
    effective_date?: string;
  }>();
  if (!body.symbol || typeof body.symbol !== "string")
    return c.json({ error: "Symbol required" }, 400);
  if (body.type !== "split" && body.type !== "merge")
    return c.json({ error: "Type must be split or merge" }, 400);
  if (typeof body.ratio !== "number" || body.ratio <= 0)
    return c.json({ error: "Ratio must be positive" }, 400);
  if (!body.effective_date || typeof body.effective_date !== "string")
    return c.json({ error: "Effective date required" }, 400);

  await c.env.DB.prepare(
    "INSERT INTO corporate_actions (portfolio_id, symbol, type, ratio, effective_date) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(portfolioId, body.symbol.trim(), body.type, body.ratio, body.effective_date)
    .run();

  return c.json({ data: { symbol: body.symbol.trim(), type: body.type, ratio: body.ratio } }, 201);
});

export default corporateActions;
