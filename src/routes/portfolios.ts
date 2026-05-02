import { Hono } from "hono";
import type { AuthVariables } from "../middleware/auth";
import type { Bindings } from "../types";
import type { Holding, HoldingLots, LotDetail, Portfolio } from "../../shared/types/api";
import { getLatestPrice } from "./prices";

/**
 * Calculate cash balance dynamically from all transfers and transactions.
 * This is the single source of truth for portfolio cash balance.
 */
export async function calculateCashBalance(db: D1Database, portfolioId: number): Promise<number> {
  const result = await db
    .prepare(
      `
    SELECT
      COALESCE(SUM(CASE
        WHEN type = 'deposit' THEN amount - fee
        WHEN type = 'withdrawal' THEN -(amount + fee)
      END), 0) as transfer_cash,
      (SELECT COALESCE(SUM(CASE
        WHEN type IN ('buy', 'initial') THEN -(quantity * price + fee)
        WHEN type = 'sell' THEN quantity * price - fee
        WHEN type = 'dividend' THEN quantity * price - fee
      END), 0) FROM transactions WHERE portfolio_id = ?) as tx_cash
    FROM transfers WHERE portfolio_id = ?
  `,
    )
    .bind(portfolioId, portfolioId)
    .first<{ transfer_cash: number; tx_cash: number }>();

  return (result?.transfer_cash ?? 0) + (result?.tx_cash ?? 0);
}

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
    "SELECT symbol, SUM(remaining_quantity) AS quantity, SUM(remaining_quantity * cost_basis / quantity) AS cost FROM lots WHERE portfolio_id = ? AND remaining_quantity > 0 GROUP BY symbol",
  )
    .bind(portfolioId)
    .all<{ symbol: string; quantity: number; cost: number }>();

  const holdings: Holding[] = [];
  for (const lot of lots.results) {
    const price = await getLatestPrice(c.env.DB, lot.symbol);
    const nameRow = await c.env.DB.prepare("SELECT name FROM stocks WHERE symbol = ?")
      .bind(lot.symbol)
      .first<{ name: string }>();
    const marketValue = price !== null ? lot.quantity * price : null;
    const unrealizedPnl = marketValue !== null ? marketValue - lot.cost : null;
    const unrealizedPnlRate =
      unrealizedPnl !== null && lot.cost > 0 ? (unrealizedPnl / lot.cost) * 100 : null;

    holdings.push({
      symbol: lot.symbol,
      name: nameRow?.name ?? lot.symbol,
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

portfolios.get("/:id/holdings/:symbol/lots", async (c) => {
  const user = c.get("user");
  const portfolioId = parseInt(c.req.param("id") ?? "", 10);
  if (isNaN(portfolioId)) {
    return c.json({ error: "Invalid portfolio ID" }, 400);
  }

  const symbol = c.req.param("symbol")?.toUpperCase();
  if (!symbol) {
    return c.json({ error: "Symbol is required" }, 400);
  }

  const portfolio = await c.env.DB.prepare("SELECT id FROM portfolios WHERE id = ? AND user_id = ?")
    .bind(portfolioId, user.id)
    .first();
  if (!portfolio) {
    return c.json({ error: "Portfolio not found" }, 404);
  }

  const nameRow = await c.env.DB.prepare("SELECT name FROM stocks WHERE symbol = ?")
    .bind(symbol)
    .first<{ name: string }>();

  const currentPrice = await getLatestPrice(c.env.DB, symbol);

  const lots = await c.env.DB.prepare(
    "SELECT l.id, l.quantity, l.remaining_quantity, l.cost_basis, l.created_at, t.date, t.price AS buy_price FROM lots l JOIN transactions t ON l.transaction_id = t.id WHERE l.portfolio_id = ? AND l.symbol = ? ORDER BY l.created_at ASC",
  )
    .bind(portfolioId, symbol)
    .all<{
      id: number;
      quantity: number;
      remaining_quantity: number;
      cost_basis: number;
      created_at: string;
      date: string;
      buy_price: number;
    }>();

  const totalQuantity = lots.results
    .filter((l) => l.remaining_quantity > 0)
    .reduce((sum, l) => sum + l.remaining_quantity, 0);

  const lotDetails: LotDetail[] = lots.results.map((l) => {
    const proportionalCost = (l.cost_basis / l.quantity) * l.remaining_quantity;
    const currentValue = currentPrice !== null ? l.remaining_quantity * currentPrice : null;
    const unrealizedPnl = currentValue !== null ? currentValue - proportionalCost : null;
    const unrealizedPnlRate =
      unrealizedPnl !== null && proportionalCost > 0
        ? (unrealizedPnl / proportionalCost) * 100
        : null;

    return {
      id: l.id,
      date: l.date,
      buy_price: Math.round(l.buy_price * 100) / 100,
      quantity: l.quantity,
      remaining_quantity: l.remaining_quantity,
      cost_basis: Math.round(proportionalCost * 100) / 100,
      current_value: currentValue !== null ? Math.round(currentValue * 100) / 100 : null,
      unrealized_pnl: unrealizedPnl !== null ? Math.round(unrealizedPnl * 100) / 100 : null,
      unrealized_pnl_rate:
        unrealizedPnlRate !== null ? Math.round(unrealizedPnlRate * 100) / 100 : null,
      status: l.remaining_quantity > 0 ? ("open" as const) : ("closed" as const),
    };
  });

  const holdingLots: HoldingLots = {
    symbol,
    name: nameRow?.name ?? symbol,
    total_quantity: Math.round(totalQuantity * 100) / 100,
    lots: lotDetails,
  };

  return c.json({ data: holdingLots });
});

portfolios.post("/:id/recalculate-cash", async (c) => {
  const user = c.get("user");
  const portfolioId = parseInt(c.req.param("id") ?? "", 10);
  if (isNaN(portfolioId)) return c.json({ error: "Invalid portfolio ID" }, 400);

  const portfolio = await c.env.DB.prepare("SELECT id FROM portfolios WHERE id = ? AND user_id = ?")
    .bind(portfolioId, user.id)
    .first();
  if (!portfolio) return c.json({ error: "Portfolio not found" }, 404);

  const cashBalance = await calculateCashBalance(c.env.DB, portfolioId);

  return c.json({
    data: { cash_balance: Math.round(cashBalance * 100) / 100 },
  });
});

portfolios.get("/:id/summary", async (c) => {
  const user = c.get("user");
  const portfolioId = parseInt(c.req.param("id") ?? "", 10);
  if (isNaN(portfolioId)) return c.json({ error: "Invalid portfolio ID" }, 400);

  const portfolio = await c.env.DB.prepare("SELECT id FROM portfolios WHERE id = ? AND user_id = ?")
    .bind(portfolioId, user.id)
    .first<{ id: number }>();
  if (!portfolio) return c.json({ error: "Portfolio not found" }, 404);

  const investmentRow = await c.env.DB.prepare(
    "SELECT SUM(CASE WHEN type = 'deposit' THEN amount - fee ELSE -(amount + fee) END) AS total FROM transfers WHERE portfolio_id = ?",
  )
    .bind(portfolioId)
    .first<{ total: number | null }>();

  const lots = await c.env.DB.prepare(
    "SELECT symbol, SUM(remaining_quantity) AS qty, SUM(remaining_quantity * cost_basis / quantity) AS cost FROM lots WHERE portfolio_id = ? AND remaining_quantity > 0 GROUP BY symbol",
  )
    .bind(portfolioId)
    .all<{ symbol: string; qty: number; cost: number }>();

  let totalMarketValue = 0;
  let totalCost = 0;
  for (const row of lots.results) {
    const price = await getLatestPrice(c.env.DB, row.symbol);
    if (price !== null) {
      totalMarketValue += row.qty * price;
    }
    totalCost += row.cost;
  }

  const realizedPnlRow = await c.env.DB.prepare(
    "SELECT SUM(rp.pnl) AS total FROM realized_pnl rp JOIN transactions t ON rp.sell_transaction_id = t.id WHERE t.portfolio_id = ?",
  )
    .bind(portfolioId)
    .first<{ total: number | null }>();

  const dividendRow = await c.env.DB.prepare(
    "SELECT SUM(quantity * price - fee) AS total FROM transactions WHERE portfolio_id = ? AND type = 'dividend'",
  )
    .bind(portfolioId)
    .first<{ total: number | null }>();

  const feeRow = await c.env.DB.prepare(
    "SELECT SUM(CASE WHEN type IN ('buy', 'initial') THEN fee ELSE 0 END) AS buy_fees, SUM(CASE WHEN type = 'sell' THEN fee ELSE 0 END) AS sell_fees, SUM(CASE WHEN type = 'dividend' THEN fee ELSE 0 END) AS withholding_tax FROM transactions WHERE portfolio_id = ?",
  )
    .bind(portfolioId)
    .first<{ buy_fees: number | null; sell_fees: number | null; withholding_tax: number | null }>();

  const totalInvestment = investmentRow?.total ?? 0;
  const unrealizedPnl = totalMarketValue - totalCost;
  const realizedPnl = realizedPnlRow?.total ?? 0;
  const realizedWithFee = realizedPnl - (feeRow?.sell_fees ?? 0);
  const dividendIncome = dividendRow?.total ?? 0;
  const totalPnl = unrealizedPnl + realizedWithFee + dividendIncome;
  const returnRate = totalInvestment > 0 ? (totalPnl / totalInvestment) * 100 : 0;
  const buyFees = feeRow?.buy_fees ?? 0;
  const sellFees = feeRow?.sell_fees ?? 0;
  const withholdingTax = feeRow?.withholding_tax ?? 0;
  const cashBalance = await calculateCashBalance(c.env.DB, portfolioId);
  const portfolioValue = totalMarketValue + cashBalance;

  const priceUpdatedAtRow =
    lots.results.length > 0
      ? await c.env.DB.prepare(
          "SELECT MIN(latest_date) as price_updated_at FROM (SELECT symbol, MAX(date) as latest_date FROM price_history WHERE symbol IN (SELECT DISTINCT symbol FROM lots WHERE portfolio_id = ? AND remaining_quantity > 0) GROUP BY symbol)",
        )
          .bind(portfolioId)
          .first<{ price_updated_at: string | null }>()
      : null;

  return c.json({
    data: {
      total_investment: Math.round(totalInvestment * 100) / 100,
      securities_value: Math.round(totalMarketValue * 100) / 100,
      cash_balance: Math.round(cashBalance * 100) / 100,
      portfolio_value: Math.round(portfolioValue * 100) / 100,
      unrealized_pnl: Math.round(unrealizedPnl * 100) / 100,
      realized_pnl: Math.round(realizedWithFee * 100) / 100,
      dividend_income: Math.round(dividendIncome * 100) / 100,
      total_pnl: Math.round(totalPnl * 100) / 100,
      return_rate: Math.round(returnRate * 100) / 100,
      cumulative_buy_fees: Math.round(buyFees * 100) / 100,
      cumulative_sell_fees: Math.round(sellFees * 100) / 100,
      cumulative_withholding_tax: Math.round(withholdingTax * 100) / 100,
      cumulative_total_fees: Math.round((buyFees + sellFees + withholdingTax) * 100) / 100,
      price_updated_at: priceUpdatedAtRow?.price_updated_at ?? null,
    },
  });
});

export default portfolios;
