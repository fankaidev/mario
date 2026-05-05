import { Hono } from "hono";
import type { AuthVariables } from "../middleware/auth";
import type { Bindings } from "../types";
import type {
  Holding,
  HoldingLots,
  LotDetail,
  Portfolio,
  PortfolioSummary,
  Transaction,
} from "../../shared/types/api";
import { getLatestPrice } from "./prices";
import { replayFIFO, type CorporateAction } from "../lib/fifo";
import { calculateXIRR, type CashFlow } from "../lib/finance";

/**
 * Fetch corporate actions for a portfolio.
 */
export async function getCorporateActions(
  db: D1Database,
  portfolioId: number,
): Promise<CorporateAction[]> {
  const rows = await db
    .prepare(
      "SELECT id, symbol, type, ratio, effective_date FROM corporate_actions WHERE portfolio_id = ? ORDER BY effective_date, id",
    )
    .bind(portfolioId)
    .all<{ id: number; symbol: string; type: string; ratio: number; effective_date: string }>();

  return rows.results.map((row) => ({
    id: row.id,
    symbol: row.symbol,
    type: row.type as "split" | "merge",
    ratio: row.ratio,
    effective_date: row.effective_date,
  }));
}

/**
 * Get cash flows for IRR calculation from transfers (excluding interest).
 * Deposit/initial → negative (money in). Withdrawal → positive (money out).
 */
export async function getIRRCashFlows(
  db: D1Database,
  portfolioId: number,
  upToDate?: string,
): Promise<CashFlow[]> {
  const dateFilter = upToDate ? "AND date <= ?" : "";
  const rows = await db
    .prepare(
      `SELECT type, amount, fee, date FROM cash_movements WHERE portfolio_id = ? AND type != 'interest' ${dateFilter} ORDER BY date`,
    )
    .bind(...(upToDate ? [portfolioId, upToDate] : [portfolioId]))
    .all<{ type: string; amount: number; fee: number; date: string }>();

  return rows.results.map((row) => ({
    date: row.date,
    amount: row.type === "withdrawal" ? row.amount + row.fee : -(row.amount - row.fee),
  }));
}

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
        WHEN type = 'withdrawal' THEN -(amount + fee)
        ELSE amount - fee
      END), 0) as transfer_cash,
      (SELECT COALESCE(SUM(CASE
        WHEN type IN ('buy', 'initial') THEN -(quantity * price + fee)
        WHEN type = 'sell' THEN quantity * price - fee
        WHEN type = 'dividend' THEN quantity * price - fee
      END), 0) FROM transactions WHERE portfolio_id = ?) as tx_cash
    FROM cash_movements WHERE portfolio_id = ?
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
    "SELECT id, user_id, name, currency, created_at, archived, deleted_at FROM portfolios WHERE id = ?",
  )
    .bind(result.meta.last_row_id)
    .first<Portfolio>();

  return c.json({ data: portfolio }, 201);
});

portfolios.get("/", async (c) => {
  const user = c.get("user");
  const includeDeleted = c.req.query("include_deleted") === "true";
  const rows = await c.env.DB.prepare(
    includeDeleted
      ? "SELECT id, user_id, name, currency, created_at, archived, deleted_at FROM portfolios WHERE user_id = ? ORDER BY created_at DESC"
      : "SELECT id, user_id, name, currency, created_at, archived, deleted_at FROM portfolios WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at DESC",
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
    "SELECT id, user_id, name, currency, created_at, archived, deleted_at FROM portfolios WHERE id = ? AND user_id = ? AND deleted_at IS NULL",
  )
    .bind(id, user.id)
    .first<Portfolio>();

  if (!portfolio) {
    return c.json({ error: "Portfolio not found" }, 404);
  }

  return c.json({ data: portfolio });
});

portfolios.delete("/:id", async (c) => {
  const user = c.get("user");
  const id = parseInt(c.req.param("id"), 10);
  if (isNaN(id)) {
    return c.json({ error: "Invalid portfolio ID" }, 400);
  }

  const portfolio = await c.env.DB.prepare(
    "SELECT id FROM portfolios WHERE id = ? AND user_id = ? AND deleted_at IS NULL",
  )
    .bind(id, user.id)
    .first<{ id: number }>();

  if (!portfolio) {
    return c.json({ error: "Portfolio not found" }, 404);
  }

  await c.env.DB.prepare("UPDATE portfolios SET deleted_at = ? WHERE id = ?")
    .bind(new Date().toISOString(), id)
    .run();

  return c.json({ data: { message: "Portfolio deleted" } });
});

portfolios.post("/:id/restore", async (c) => {
  const user = c.get("user");
  const id = parseInt(c.req.param("id"), 10);
  if (isNaN(id)) {
    return c.json({ error: "Invalid portfolio ID" }, 400);
  }

  const portfolio = await c.env.DB.prepare(
    "SELECT id FROM portfolios WHERE id = ? AND user_id = ? AND deleted_at IS NOT NULL",
  )
    .bind(id, user.id)
    .first<{ id: number }>();

  if (!portfolio) {
    return c.json({ error: "Portfolio not found or not deleted" }, 404);
  }

  await c.env.DB.prepare("UPDATE portfolios SET deleted_at = NULL WHERE id = ?").bind(id).run();

  const restored = await c.env.DB.prepare(
    "SELECT id, user_id, name, currency, created_at, archived, deleted_at FROM portfolios WHERE id = ?",
  )
    .bind(id)
    .first<Portfolio>();

  return c.json({ data: restored });
});

portfolios.get("/:id/holdings", async (c) => {
  const user = c.get("user");
  const portfolioId = parseInt(c.req.param("id") ?? "", 10);
  if (isNaN(portfolioId)) {
    return c.json({ error: "Invalid portfolio ID" }, 400);
  }

  const portfolio = await c.env.DB.prepare(
    "SELECT id FROM portfolios WHERE id = ? AND user_id = ? AND deleted_at IS NULL",
  )
    .bind(portfolioId, user.id)
    .first();
  if (!portfolio) {
    return c.json({ error: "Portfolio not found" }, 404);
  }

  // Get all transactions and corporate actions for this portfolio
  const txRows = await c.env.DB.prepare(
    "SELECT id, portfolio_id, symbol, type, quantity, price, fee, date, created_at FROM transactions WHERE portfolio_id = ? ORDER BY date, created_at",
  )
    .bind(portfolioId)
    .all<Transaction>();

  const corporateActions = await getCorporateActions(c.env.DB, portfolioId);

  // Replay FIFO to get current lots
  const { lots } = replayFIFO(txRows.results, corporateActions);

  // Group lots by symbol and calculate holdings
  const holdingsBySymbol = new Map<string, { quantity: number; cost: number }>();

  for (const lot of lots) {
    if (lot.remaining_quantity <= 0) continue;

    const existing = holdingsBySymbol.get(lot.symbol) ?? { quantity: 0, cost: 0 };
    const proportionalCost = (lot.cost_basis / lot.quantity) * lot.remaining_quantity;

    holdingsBySymbol.set(lot.symbol, {
      quantity: existing.quantity + lot.remaining_quantity,
      cost: existing.cost + proportionalCost,
    });
  }

  const holdings: Holding[] = [];
  for (const [symbol, holding] of holdingsBySymbol) {
    const price = await getLatestPrice(c.env.DB, symbol);
    const nameRow = await c.env.DB.prepare("SELECT name FROM stocks WHERE symbol = ?")
      .bind(symbol)
      .first<{ name: string }>();
    const marketValue = price !== null ? holding.quantity * price : null;
    const unrealizedPnl = marketValue !== null ? marketValue - holding.cost : null;
    const unrealizedPnlRate =
      unrealizedPnl !== null && holding.cost > 0 ? (unrealizedPnl / holding.cost) * 100 : null;

    holdings.push({
      symbol,
      name: nameRow?.name ?? symbol,
      quantity: holding.quantity,
      cost: Math.round(holding.cost * 100) / 100,
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

  const portfolio = await c.env.DB.prepare(
    "SELECT id FROM portfolios WHERE id = ? AND user_id = ? AND deleted_at IS NULL",
  )
    .bind(portfolioId, user.id)
    .first();
  if (!portfolio) {
    return c.json({ error: "Portfolio not found" }, 404);
  }

  const nameRow = await c.env.DB.prepare("SELECT name FROM stocks WHERE symbol = ?")
    .bind(symbol)
    .first<{ name: string }>();

  const currentPrice = await getLatestPrice(c.env.DB, symbol);

  // Get all transactions and corporate actions for this portfolio
  const txRows = await c.env.DB.prepare(
    "SELECT id, portfolio_id, symbol, type, quantity, price, fee, date, created_at FROM transactions WHERE portfolio_id = ? ORDER BY date, created_at",
  )
    .bind(portfolioId)
    .all<Transaction>();

  const corporateActions = await getCorporateActions(c.env.DB, portfolioId);

  // Replay FIFO to get current lots
  const { lots } = replayFIFO(txRows.results, corporateActions);

  // Filter lots for this symbol
  const symbolLots = lots.filter((l) => l.symbol === symbol);

  const totalQuantity = symbolLots
    .filter((l) => l.remaining_quantity > 0)
    .reduce((sum, l) => sum + l.remaining_quantity, 0);

  // Get buy prices from transactions
  const buyPricesMap = new Map<number, number>();
  for (const tx of txRows.results) {
    if (tx.type === "buy" || tx.type === "initial") {
      buyPricesMap.set(tx.id, tx.price);
    }
  }

  const lotDetails: LotDetail[] = symbolLots.map((l) => {
    const proportionalCost = (l.cost_basis / l.quantity) * l.remaining_quantity;
    const currentValue = currentPrice !== null ? l.remaining_quantity * currentPrice : null;
    const unrealizedPnl = currentValue !== null ? currentValue - proportionalCost : null;
    const unrealizedPnlRate =
      unrealizedPnl !== null && proportionalCost > 0
        ? (unrealizedPnl / proportionalCost) * 100
        : null;

    return {
      id: l.transaction_id,
      date: l.date,
      buy_price: Math.round((buyPricesMap.get(l.transaction_id) ?? 0) * 100) / 100,
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

/**
 * Calculate portfolio summary metrics from transactions, transfers, and price data.
 * All values are in the portfolio's native currency.
 */
export async function getPortfolioSummary(
  db: D1Database,
  portfolioId: number,
): Promise<PortfolioSummary> {
  const investmentRow = await db
    .prepare(
      "SELECT SUM(CASE WHEN type = 'withdrawal' THEN -(amount + fee) WHEN type = 'interest' THEN 0 ELSE amount - fee END) AS total FROM cash_movements WHERE portfolio_id = ?",
    )
    .bind(portfolioId)
    .first<{ total: number | null }>();

  const txRows = await db
    .prepare(
      "SELECT id, portfolio_id, symbol, type, quantity, price, fee, date, created_at FROM transactions WHERE portfolio_id = ? ORDER BY date, created_at",
    )
    .bind(portfolioId)
    .all<Transaction>();

  const corporateActions = await getCorporateActions(db, portfolioId);

  const { lots, realizedPnl } = replayFIFO(txRows.results, corporateActions);

  const holdingsBySymbol = new Map<string, { quantity: number; cost: number }>();

  for (const lot of lots) {
    if (lot.remaining_quantity <= 0) continue;

    const existing = holdingsBySymbol.get(lot.symbol) ?? { quantity: 0, cost: 0 };
    const proportionalCost = (lot.cost_basis / lot.quantity) * lot.remaining_quantity;

    holdingsBySymbol.set(lot.symbol, {
      quantity: existing.quantity + lot.remaining_quantity,
      cost: existing.cost + proportionalCost,
    });
  }

  let totalMarketValue = 0;
  let totalCost = 0;
  for (const [symbol, holding] of holdingsBySymbol) {
    const price = await getLatestPrice(db, symbol);
    if (price !== null) {
      totalMarketValue += holding.quantity * price;
    }
    totalCost += holding.cost;
  }

  const totalRealizedPnl = realizedPnl.reduce((sum, r) => sum + r.pnl, 0);

  const dividendRow = await db
    .prepare(
      "SELECT SUM(quantity * price - fee) AS total FROM transactions WHERE portfolio_id = ? AND type = 'dividend'",
    )
    .bind(portfolioId)
    .first<{ total: number | null }>();

  const feeRow = await db
    .prepare(
      "SELECT SUM(CASE WHEN type IN ('buy', 'initial') THEN fee ELSE 0 END) AS buy_fees, SUM(CASE WHEN type = 'sell' THEN fee ELSE 0 END) AS sell_fees, SUM(CASE WHEN type = 'dividend' THEN fee ELSE 0 END) AS withholding_tax FROM transactions WHERE portfolio_id = ?",
    )
    .bind(portfolioId)
    .first<{
      buy_fees: number | null;
      sell_fees: number | null;
      withholding_tax: number | null;
    }>();

  const totalInvestment = investmentRow?.total ?? 0;
  const unrealizedPnl = totalMarketValue - totalCost;
  const realizedWithFee = totalRealizedPnl - (feeRow?.sell_fees ?? 0);
  const dividendIncome = dividendRow?.total ?? 0;
  const totalPnl = unrealizedPnl + realizedWithFee + dividendIncome;

  // Compute IRR from transfer cash flows + terminal portfolio value
  const cashBalance = await calculateCashBalance(db, portfolioId);
  const portfolioValue = totalMarketValue + cashBalance;
  const irrCashFlows = await getIRRCashFlows(db, portfolioId);
  if (portfolioValue > 0 || irrCashFlows.length > 0) {
    irrCashFlows.push({ date: new Date().toISOString().split("T")[0]!, amount: portfolioValue });
  }
  const irr = calculateXIRR(irrCashFlows);
  const returnRate =
    irr !== null ? irr * 100 : totalInvestment > 0 ? (totalPnl / totalInvestment) * 100 : 0;
  const buyFees = feeRow?.buy_fees ?? 0;
  const sellFees = feeRow?.sell_fees ?? 0;
  const withholdingTax = feeRow?.withholding_tax ?? 0;

  const symbols = Array.from(holdingsBySymbol.keys());
  const priceUpdatedAtRow =
    symbols.length > 0
      ? await db
          .prepare(
            `SELECT MIN(latest_date) as price_updated_at FROM (SELECT symbol, MAX(date) as latest_date FROM price_history WHERE symbol IN (${symbols.map(() => "?").join(",")}) GROUP BY symbol)`,
          )
          .bind(...symbols)
          .first<{ price_updated_at: string | null }>()
      : null;

  return {
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
  };
}

portfolios.get("/:id/summary", async (c) => {
  const user = c.get("user");
  const portfolioId = parseInt(c.req.param("id") ?? "", 10);
  if (isNaN(portfolioId)) return c.json({ error: "Invalid portfolio ID" }, 400);

  const portfolio = await c.env.DB.prepare(
    "SELECT id FROM portfolios WHERE id = ? AND user_id = ? AND deleted_at IS NULL",
  )
    .bind(portfolioId, user.id)
    .first<{ id: number }>();
  if (!portfolio) return c.json({ error: "Portfolio not found" }, 404);

  const summary = await getPortfolioSummary(c.env.DB, portfolioId);
  return c.json({ data: summary });
});

export default portfolios;
