import { Hono } from "hono";
import type { AuthVariables } from "../middleware/auth";
import type { Bindings } from "../types";
import type { PortfolioSnapshot } from "../../shared/types/api";

const snapshots = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>();

snapshots.post("/", async (c) => {
  const user = c.get("user");
  const portfolioId = parseInt(c.req.param("portfolioId") ?? "", 10);
  if (isNaN(portfolioId)) return c.json({ error: "Invalid portfolio ID" }, 400);

  const portfolio = await c.env.DB.prepare("SELECT id FROM portfolios WHERE id = ? AND user_id = ?")
    .bind(portfolioId, user.id)
    .first();
  if (!portfolio) return c.json({ error: "Portfolio not found" }, 404);

  const body = await c.req.json<{
    date?: string;
    total_investment?: number;
    market_value?: number;
    note?: string;
  }>();
  if (!body.date || typeof body.date !== "string")
    return c.json({ error: "Date is required" }, 400);
  if (typeof body.total_investment !== "number" || body.total_investment < 0)
    return c.json({ error: "Total investment is required" }, 400);
  if (typeof body.market_value !== "number" || body.market_value < 0)
    return c.json({ error: "Market value is required" }, 400);

  const existing = await c.env.DB.prepare(
    "SELECT id FROM portfolio_snapshots WHERE portfolio_id = ? AND date = ?",
  )
    .bind(portfolioId, body.date)
    .first();
  if (existing) return c.json({ error: "Snapshot already exists for this date" }, 409);

  const result = await c.env.DB.prepare(
    "INSERT INTO portfolio_snapshots (portfolio_id, date, total_investment, market_value, note) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(portfolioId, body.date, body.total_investment, body.market_value, body.note ?? null)
    .run();

  const snapshot = await c.env.DB.prepare(
    "SELECT id, portfolio_id, date, total_investment, market_value, note, created_at FROM portfolio_snapshots WHERE id = ?",
  )
    .bind(result.meta.last_row_id)
    .first<PortfolioSnapshot>();

  return c.json({ data: snapshot }, 201);
});

snapshots.get("/", async (c) => {
  const user = c.get("user");
  const portfolioId = parseInt(c.req.param("portfolioId") ?? "", 10);
  if (isNaN(portfolioId)) return c.json({ error: "Invalid portfolio ID" }, 400);

  const portfolio = await c.env.DB.prepare("SELECT id FROM portfolios WHERE id = ? AND user_id = ?")
    .bind(portfolioId, user.id)
    .first();
  if (!portfolio) return c.json({ error: "Portfolio not found" }, 404);

  const rows = await c.env.DB.prepare(
    "SELECT id, portfolio_id, date, total_investment, market_value, note, created_at FROM portfolio_snapshots WHERE portfolio_id = ? ORDER BY date DESC",
  )
    .bind(portfolioId)
    .all<PortfolioSnapshot>();

  return c.json({ data: rows.results });
});

snapshots.delete("/:snapshotId", async (c) => {
  const user = c.get("user");
  const portfolioId = parseInt(c.req.param("portfolioId") ?? "", 10);
  const snapshotId = parseInt(c.req.param("snapshotId") ?? "", 10);
  if (isNaN(portfolioId) || isNaN(snapshotId)) return c.json({ error: "Invalid ID" }, 400);

  const portfolio = await c.env.DB.prepare("SELECT id FROM portfolios WHERE id = ? AND user_id = ?")
    .bind(portfolioId, user.id)
    .first();
  if (!portfolio) return c.json({ error: "Portfolio not found" }, 404);

  const snapshot = await c.env.DB.prepare(
    "SELECT id FROM portfolio_snapshots WHERE id = ? AND portfolio_id = ?",
  )
    .bind(snapshotId, portfolioId)
    .first();
  if (!snapshot) return c.json({ error: "Snapshot not found" }, 404);

  await c.env.DB.prepare("DELETE FROM portfolio_snapshots WHERE id = ?").bind(snapshotId).run();

  return c.json({ data: null });
});

export default snapshots;
