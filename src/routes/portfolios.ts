import { Hono } from "hono";
import type { AuthVariables } from "../middleware/auth";
import type { Bindings } from "../types";
import type { Portfolio } from "../../shared/types/api";

type Holding = {
  symbol: string;
  quantity: number;
  cost: number;
  price: number | null;
  market_value: number | null;
  unrealized_pnl: number | null;
  unrealized_pnl_rate: number | null;
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

  return c.json({ data: holdings });
});

portfolios.get("/:id/summary", async (c) => {
  const user = c.get("user");
  const portfolioId = parseInt(c.req.param("id") ?? "", 10);
  if (isNaN(portfolioId)) return c.json({ error: "Invalid portfolio ID" }, 400);

  const portfolio = await c.env.DB.prepare("SELECT id FROM portfolios WHERE id = ? AND user_id = ?")
    .bind(portfolioId, user.id)
    .first();
  if (!portfolio) return c.json({ error: "Portfolio not found" }, 404);

  const buyRow = await c.env.DB.prepare(
    "SELECT SUM(quantity * price + fee) AS total FROM transactions WHERE portfolio_id = ? AND type IN ('buy', 'initial')",
  )
    .bind(portfolioId)
    .first<{ total: number | null }>();

  const lots = await c.env.DB.prepare(
    "SELECT symbol, SUM(remaining_quantity) AS qty, SUM(remaining_quantity * cost_basis / quantity) AS cost FROM lots WHERE portfolio_id = ? AND closed = 0 GROUP BY symbol",
  )
    .bind(portfolioId)
    .all<{ symbol: string; qty: number; cost: number }>();

  let totalMarketValue = 0;
  let totalCost = 0;
  for (const row of lots.results) {
    const priceRow = await c.env.DB.prepare("SELECT price FROM prices WHERE symbol = ?")
      .bind(row.symbol)
      .first<{ price: number | null }>();
    if (priceRow?.price != null) {
      totalMarketValue += row.qty * priceRow.price;
    }
    totalCost += row.cost;
  }

  const realizedPnlRow = await c.env.DB.prepare(
    "SELECT SUM(rp.pnl) AS total FROM realized_pnl rp JOIN transactions t ON rp.sell_transaction_id = t.id WHERE t.portfolio_id = ?",
  )
    .bind(portfolioId)
    .first<{ total: number | null }>();

  const dividendRow = await c.env.DB.prepare(
    "SELECT SUM(price - fee) AS total FROM transactions WHERE portfolio_id = ? AND type = 'dividend'",
  )
    .bind(portfolioId)
    .first<{ total: number | null }>();

  const feeRow = await c.env.DB.prepare(
    "SELECT SUM(CASE WHEN type IN ('buy', 'initial') THEN fee ELSE 0 END) AS buy_fees, SUM(CASE WHEN type = 'sell' THEN fee ELSE 0 END) AS sell_fees, SUM(CASE WHEN type = 'dividend' THEN fee ELSE 0 END) AS withholding_tax FROM transactions WHERE portfolio_id = ?",
  )
    .bind(portfolioId)
    .first<{ buy_fees: number | null; sell_fees: number | null; withholding_tax: number | null }>();

  const totalInvestment = buyRow?.total ?? 0;
  const unrealizedPnl = totalMarketValue - totalCost;
  const realizedPnl = realizedPnlRow?.total ?? 0;
  const realizedWithFee = realizedPnl - (feeRow?.sell_fees ?? 0);
  const dividendIncome = dividendRow?.total ?? 0;
  const totalPnl = unrealizedPnl + realizedWithFee + dividendIncome;
  const returnRate = totalInvestment > 0 ? (totalPnl / totalInvestment) * 100 : 0;
  const buyFees = feeRow?.buy_fees ?? 0;
  const sellFees = feeRow?.sell_fees ?? 0;
  const withholdingTax = feeRow?.withholding_tax ?? 0;

  return c.json({
    data: {
      total_investment: Math.round(totalInvestment * 100) / 100,
      total_market_value: Math.round(totalMarketValue * 100) / 100,
      unrealized_pnl: Math.round(unrealizedPnl * 100) / 100,
      realized_pnl: Math.round(realizedWithFee * 100) / 100,
      dividend_income: Math.round(dividendIncome * 100) / 100,
      total_pnl: Math.round(totalPnl * 100) / 100,
      return_rate: Math.round(returnRate * 100) / 100,
      cumulative_buy_fees: Math.round(buyFees * 100) / 100,
      cumulative_sell_fees: Math.round(sellFees * 100) / 100,
      cumulative_withholding_tax: Math.round(withholdingTax * 100) / 100,
      cumulative_total_fees: Math.round((buyFees + sellFees + withholdingTax) * 100) / 100,
    },
  });
});

export default portfolios;
