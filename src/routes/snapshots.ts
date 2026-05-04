import { Hono } from "hono";
import type { AuthVariables } from "../middleware/auth";
import type { Bindings } from "../types";
import type { PortfolioSnapshot, Transaction } from "../../shared/types/api";
import { replayFIFO, type CorporateAction } from "../lib/fifo";

const snapshots = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>();

export async function calculateSnapshot(
  db: D1Database,
  portfolioId: number,
  date: string,
): Promise<{
  total_investment: number;
  market_value: number;
  cash_balance: number;
  missing_prices: string[];
}> {
  // total_investment: net deposits/withdrawals up to date
  const investmentRow = await db
    .prepare(
      "SELECT COALESCE(SUM(CASE WHEN type = 'deposit' THEN amount - fee ELSE -(amount + fee) END), 0) AS total FROM transfers WHERE portfolio_id = ? AND date <= ?",
    )
    .bind(portfolioId, date)
    .first<{ total: number }>();

  // cash_balance: transfers (deposits - withdrawals) + transactions (-buy costs + sell proceeds + dividends)
  const transferCashRow = await db
    .prepare(
      "SELECT COALESCE(SUM(CASE WHEN type = 'deposit' THEN amount - fee WHEN type = 'withdrawal' THEN -(amount + fee) END), 0) AS total FROM transfers WHERE portfolio_id = ? AND date <= ?",
    )
    .bind(portfolioId, date)
    .first<{ total: number }>();

  const txCashRow = await db
    .prepare(
      "SELECT COALESCE(SUM(CASE WHEN type IN ('buy', 'initial') THEN -(quantity * price + fee) WHEN type = 'sell' THEN quantity * price - fee WHEN type = 'dividend' THEN quantity * price - fee END), 0) AS total FROM transactions WHERE portfolio_id = ? AND date <= ?",
    )
    .bind(portfolioId, date)
    .first<{ total: number }>();

  // Get transactions and corporate actions up to date and replay FIFO
  const txRows = await db
    .prepare(
      "SELECT id, portfolio_id, symbol, type, quantity, price, fee, date, created_at FROM transactions WHERE portfolio_id = ? AND date <= ? ORDER BY date, created_at",
    )
    .bind(portfolioId, date)
    .all<Transaction>();

  const caRows = await db
    .prepare(
      "SELECT id, symbol, type, ratio, effective_date FROM corporate_actions WHERE portfolio_id = ? AND effective_date <= ? ORDER BY effective_date, id",
    )
    .bind(portfolioId, date)
    .all<{ id: number; symbol: string; type: string; ratio: number; effective_date: string }>();

  const corporateActions: CorporateAction[] = caRows.results.map((row) => ({
    id: row.id,
    symbol: row.symbol,
    type: row.type as "split" | "merge",
    ratio: row.ratio,
    effective_date: row.effective_date,
  }));

  const { lots } = replayFIFO(txRows.results, corporateActions);

  // Aggregate remaining quantities by symbol
  const symbolHoldings: Map<string, number> = new Map();
  for (const lot of lots) {
    if (lot.remaining_quantity > 0) {
      symbolHoldings.set(
        lot.symbol,
        (symbolHoldings.get(lot.symbol) ?? 0) + lot.remaining_quantity,
      );
    }
  }

  // Calculate market value using most recent price at or before date
  let marketValue = 0;
  const missingPrices: string[] = [];
  for (const [symbol, qty] of symbolHoldings) {
    const priceRow = await db
      .prepare(
        "SELECT close FROM price_history WHERE symbol = ? AND date <= ? ORDER BY date DESC LIMIT 1",
      )
      .bind(symbol, date)
      .first<{ close: number }>();
    if (priceRow) {
      marketValue += qty * priceRow.close;
    } else {
      missingPrices.push(symbol);
    }
  }

  return {
    total_investment: investmentRow?.total ?? 0,
    market_value: Math.round(marketValue * 100) / 100,
    cash_balance: Math.round(((transferCashRow?.total ?? 0) + (txCashRow?.total ?? 0)) * 100) / 100,
    missing_prices: missingPrices,
  };
}

snapshots.post("/", async (c) => {
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
    date?: string;
    total_investment?: number;
    market_value?: number;
    cash_balance?: number;
    note?: string;
  }>();
  if (!body.date || typeof body.date !== "string")
    return c.json({ error: "Date is required" }, 400);
  if (typeof body.total_investment !== "number" || body.total_investment < 0)
    return c.json({ error: "Total investment is required" }, 400);
  if (typeof body.market_value !== "number" || body.market_value < 0)
    return c.json({ error: "Market value is required" }, 400);
  if (typeof body.cash_balance !== "number" || body.cash_balance < 0)
    return c.json({ error: "Cash balance is required" }, 400);

  const existing = await c.env.DB.prepare(
    "SELECT id FROM portfolio_snapshots WHERE portfolio_id = ? AND date = ?",
  )
    .bind(portfolioId, body.date)
    .first();
  if (existing) return c.json({ error: "Snapshot already exists for this date" }, 409);

  const result = await c.env.DB.prepare(
    "INSERT INTO portfolio_snapshots (portfolio_id, date, total_investment, market_value, cash_balance, note) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(
      portfolioId,
      body.date,
      body.total_investment,
      body.market_value,
      body.cash_balance,
      body.note ?? null,
    )
    .run();

  const snapshot = await c.env.DB.prepare(
    "SELECT id, portfolio_id, date, total_investment, market_value, cash_balance, note, created_at FROM portfolio_snapshots WHERE id = ?",
  )
    .bind(result.meta.last_row_id)
    .first<PortfolioSnapshot>();

  return c.json({ data: snapshot }, 201);
});

snapshots.post("/calculate", async (c) => {
  const user = c.get("user");
  const portfolioId = parseInt(c.req.param("portfolioId") ?? "", 10);
  if (isNaN(portfolioId)) return c.json({ error: "Invalid portfolio ID" }, 400);

  const portfolio = await c.env.DB.prepare(
    "SELECT id FROM portfolios WHERE id = ? AND user_id = ? AND deleted_at IS NULL",
  )
    .bind(portfolioId, user.id)
    .first();
  if (!portfolio) return c.json({ error: "Portfolio not found" }, 404);

  const body = (await c.req.json<{ date?: string }>().catch(() => ({ date: undefined }))) as {
    date?: string;
  };
  const date = body.date ?? new Date().toISOString().split("T")[0]!;

  if (date > new Date().toISOString().split("T")[0]!) {
    return c.json({ error: "Date cannot be in the future" }, 400);
  }

  const existing = await c.env.DB.prepare(
    "SELECT id FROM portfolio_snapshots WHERE portfolio_id = ? AND date = ?",
  )
    .bind(portfolioId, date)
    .first();
  if (existing) return c.json({ error: "Snapshot already exists for this date" }, 409);

  const calculated = await calculateSnapshot(c.env.DB, portfolioId, date);

  if (calculated.missing_prices.length > 0) {
    return c.json(
      { error: `Missing price history for: ${calculated.missing_prices.join(", ")}` },
      422,
    );
  }

  const result = await c.env.DB.prepare(
    "INSERT INTO portfolio_snapshots (portfolio_id, date, total_investment, market_value, cash_balance) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(
      portfolioId,
      date,
      calculated.total_investment,
      calculated.market_value,
      calculated.cash_balance,
    )
    .run();

  const snapshot = await c.env.DB.prepare(
    "SELECT id, portfolio_id, date, total_investment, market_value, cash_balance, note, created_at FROM portfolio_snapshots WHERE id = ?",
  )
    .bind(result.meta.last_row_id)
    .first<PortfolioSnapshot>();

  return c.json({ data: snapshot }, 201);
});

snapshots.get("/", async (c) => {
  const user = c.get("user");
  const portfolioId = parseInt(c.req.param("portfolioId") ?? "", 10);
  if (isNaN(portfolioId)) return c.json({ error: "Invalid portfolio ID" }, 400);

  const portfolio = await c.env.DB.prepare(
    "SELECT id FROM portfolios WHERE id = ? AND user_id = ? AND deleted_at IS NULL",
  )
    .bind(portfolioId, user.id)
    .first();
  if (!portfolio) return c.json({ error: "Portfolio not found" }, 404);

  const rows = await c.env.DB.prepare(
    "SELECT id, portfolio_id, date, total_investment, market_value, cash_balance, note, created_at FROM portfolio_snapshots WHERE portfolio_id = ? ORDER BY date DESC",
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

  const portfolio = await c.env.DB.prepare(
    "SELECT id FROM portfolios WHERE id = ? AND user_id = ? AND deleted_at IS NULL",
  )
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
