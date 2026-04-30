import { Hono } from "hono";
import type { AuthVariables } from "../middleware/auth";
import type { Portfolio } from "../../shared/types/api";

type Bindings = {
  DB: D1Database;
};

type Holding = {
  symbol: string;
  quantity: number;
  cost: number;
  price: number | null;
  market_value: number | null;
  unrealized_pnl: number | null;
  unrealized_pnl_rate: number | null;
};

const SORT_COLUMNS: Record<string, string> = {
  symbol: "symbol",
  quantity: "quantity",
  marketValue: "market_value",
  unrealizedPnl: "unrealized_pnl",
  unrealizedPnlRate: "unrealized_pnl_rate",
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

portfolios.get("/:id/holdings", async (c) => {
  const user = c.get("user");
  const portfolioId = parseInt(c.req.param("id") ?? "", 10);
  if (isNaN(portfolioId)) {
    return c.json({ error: "Invalid portfolio ID" }, 400);
  }

  const portfolio = await c.env.DB.prepare("SELECT id FROM portfolios WHERE id = ? AND user_id = ?")
    .bind(portfolioId, user.id)
    .first();
  if (!portfolio) {
    return c.json({ error: "Portfolio not found" }, 404);
  }

  const lots = await c.env.DB.prepare(
    "SELECT symbol, SUM(remaining_quantity) AS quantity, SUM(remaining_quantity * cost_basis / quantity) AS cost FROM lots WHERE portfolio_id = ? AND closed = 0 GROUP BY symbol",
  )
    .bind(portfolioId)
    .all<{ symbol: string; quantity: number; cost: number }>();

  const holdings: Holding[] = [];
  for (const lot of lots.results) {
    const priceRow = await c.env.DB.prepare("SELECT price FROM prices WHERE symbol = ?")
      .bind(lot.symbol)
      .first<{ price: number | null }>();
    const price = priceRow?.price ?? null;
    const marketValue = price !== null ? lot.quantity * price : null;
    const unrealizedPnl = marketValue !== null ? marketValue - lot.cost : null;
    const unrealizedPnlRate = unrealizedPnl !== null ? (unrealizedPnl / lot.cost) * 100 : null;

    holdings.push({
      symbol: lot.symbol,
      quantity: lot.quantity,
      cost: Math.round(lot.cost * 100) / 100,
      price,
      market_value: marketValue !== null ? Math.round(marketValue * 100) / 100 : null,
      unrealized_pnl: unrealizedPnl !== null ? Math.round(unrealizedPnl * 100) / 100 : null,
      unrealized_pnl_rate:
        unrealizedPnlRate !== null ? Math.round(unrealizedPnlRate * 100) / 100 : null,
    });
  }

  const sortParam = c.req.query("sort");
  const sortCol = SORT_COLUMNS[sortParam ?? ""] ?? "unrealized_pnl_rate";
  const direction = sortParam && sortParam !== "unrealizedPnlRate" ? "ASC" : "DESC";

  holdings.sort((a, b) => {
    const aVal = a[sortCol as keyof Holding];
    const bVal = b[sortCol as keyof Holding];
    if (aVal === null && bVal === null) return 0;
    if (aVal === null) return 1;
    if (bVal === null) return -1;
    return direction === "DESC"
      ? (bVal as number) - (aVal as number)
      : (aVal as number) - (bVal as number);
  });

  return c.json({ data: holdings });
});

export default portfolios;
