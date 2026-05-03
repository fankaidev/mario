import { Hono } from "hono";
import type { AuthVariables } from "../middleware/auth";
import type { Bindings } from "../types";
import type { IbkrFlexClient } from "../clients/ibkr";
import { mapIbkrSymbol } from "../clients/ibkr";
import type { Transaction } from "../../shared/types/api";
import { replayFIFO } from "../lib/fifo";

const importRoutes = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>();

interface ImportResult {
  trades_imported: number;
  transfers_imported: number;
  dividends_imported: number;
  skipped: number;
  errors: string[];
}

export async function importIbkrStatement(
  db: D1Database,
  portfolioId: number,
  client: IbkrFlexClient,
  token: string,
  queryId: string,
): Promise<ImportResult> {
  const statement = await client.fetchStatement(token, queryId);
  const result: ImportResult = {
    trades_imported: 0,
    transfers_imported: 0,
    dividends_imported: 0,
    skipped: 0,
    errors: [],
  };

  // Import trades (buy/sell)
  for (const trade of statement.trades) {
    try {
      const symbol = mapIbkrSymbol(trade.symbol, trade.exchange);

      // Deduplicate: check if transaction with same date/symbol/type/quantity/price exists
      const existing = await db
        .prepare(
          "SELECT id FROM transactions WHERE portfolio_id = ? AND symbol = ? AND type = ? AND quantity = ? AND price = ? AND date = ?",
        )
        .bind(
          portfolioId,
          symbol,
          trade.buySell === "BUY" ? "buy" : "sell",
          trade.quantity,
          trade.tradePrice,
          trade.tradeDate,
        )
        .first();
      if (existing) {
        result.skipped++;
        continue;
      }

      const txType = trade.buySell === "BUY" ? "buy" : "sell";

      // For sells, validate sufficient quantity via FIFO replay before inserting
      if (txType === "sell") {
        const txRows = await db
          .prepare(
            "SELECT id, portfolio_id, symbol, type, quantity, price, fee, date, created_at FROM transactions WHERE portfolio_id = ? ORDER BY date, created_at",
          )
          .bind(portfolioId)
          .all<Transaction>();

        const { lots } = replayFIFO(txRows.results);
        const symbolLots = lots.filter((l) => l.symbol === symbol && l.remaining_quantity > 0);
        const totalRemaining = symbolLots.reduce((sum, l) => sum + l.remaining_quantity, 0);

        if (totalRemaining < trade.quantity) {
          result.errors.push(
            `Insufficient lots for ${symbol} sell of ${trade.quantity} on ${trade.tradeDate}`,
          );
          continue;
        }
      }

      await db
        .prepare(
          "INSERT INTO transactions (portfolio_id, symbol, type, quantity, price, fee, date) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(
          portfolioId,
          symbol,
          txType,
          trade.quantity,
          trade.tradePrice,
          trade.ibCommission,
          trade.tradeDate,
        )
        .run();

      result.trades_imported++;
    } catch (e) {
      result.errors.push(
        `Trade ${trade.symbol} ${trade.buySell} on ${trade.tradeDate}: ${(e as Error).message}`,
      );
    }
  }

  // Group cash transactions: merge withholding tax with dividends of same symbol/date
  const dividendMap = new Map<
    string,
    { amount: number; tax: number; perShare: number; quantity: number }
  >();
  const transfers: { date: string; type: "deposit" | "withdrawal"; amount: number; fee: number }[] =
    [];

  for (const ct of statement.cashTransactions) {
    if (ct.type === "Dividends" || ct.type === "Payment In Lieu Of Dividends") {
      const key = `${ct.dateTime}|${ct.symbol}`;
      const existing = dividendMap.get(key) ?? { amount: 0, tax: 0, perShare: 0, quantity: 0 };
      existing.amount += ct.amount;

      // Extract per-share dividend from description
      // Format: "SYMBOL(...) CASH DIVIDEND USD X.XXXXX PER SHARE (...)"
      const match = ct.description.match(/DIVIDEND USD ([\d.]+) PER SHARE/);
      if (match) {
        existing.perShare = parseFloat(match[1]!);
        existing.quantity = Math.round((ct.amount / existing.perShare) * 100) / 100;
      }

      dividendMap.set(key, existing);
    } else if (ct.type === "Withholding Tax") {
      const key = `${ct.dateTime}|${ct.symbol}`;
      const existing = dividendMap.get(key) ?? { amount: 0, tax: 0, perShare: 0, quantity: 0 };
      existing.tax += Math.abs(ct.amount);
      dividendMap.set(key, existing);
    } else if (ct.type === "Deposits & Withdrawals") {
      if (ct.amount > 0) {
        transfers.push({ date: ct.dateTime, type: "deposit", amount: ct.amount, fee: 0 });
      } else if (ct.amount < 0) {
        transfers.push({
          date: ct.dateTime,
          type: "withdrawal",
          amount: Math.abs(ct.amount),
          fee: 0,
        });
      }
    }
  }

  // Import dividends
  for (const [key, div] of dividendMap) {
    const [date, symbol] = key.split("|")!;
    if (!symbol) continue;

    // Skip if we couldn't parse per-share amount
    if (div.perShare === 0 || div.quantity === 0) {
      result.errors.push(`Dividend ${symbol} on ${date}: could not parse per-share amount`);
      continue;
    }

    // Deduplicate: match by symbol, date, per-share price, and quantity
    const existing = await db
      .prepare(
        "SELECT id FROM transactions WHERE portfolio_id = ? AND symbol = ? AND type = 'dividend' AND price = ? AND quantity = ? AND date = ?",
      )
      .bind(portfolioId, symbol, div.perShare, div.quantity, date)
      .first();
    if (existing) {
      result.skipped++;
      continue;
    }

    await db
      .prepare(
        "INSERT INTO transactions (portfolio_id, symbol, type, quantity, price, fee, date) VALUES (?, ?, 'dividend', ?, ?, ?, ?)",
      )
      .bind(portfolioId, symbol, div.quantity, div.perShare, div.tax, date)
      .run();

    result.dividends_imported++;
  }

  // Import transfers
  for (const transfer of transfers) {
    // Deduplicate
    const existing = await db
      .prepare(
        "SELECT id FROM transfers WHERE portfolio_id = ? AND type = ? AND amount = ? AND date = ?",
      )
      .bind(portfolioId, transfer.type, transfer.amount, transfer.date)
      .first();
    if (existing) {
      result.skipped++;
      continue;
    }

    await db
      .prepare(
        "INSERT INTO transfers (portfolio_id, type, amount, fee, date) VALUES (?, ?, ?, ?, ?)",
      )
      .bind(portfolioId, transfer.type, transfer.amount, transfer.fee, transfer.date)
      .run();

    result.transfers_imported++;
  }

  return result;
}

importRoutes.post("/ibkr", async (c) => {
  const user = c.get("user");
  const portfolioId = parseInt(c.req.param("portfolioId") ?? "", 10);
  if (isNaN(portfolioId)) return c.json({ error: "Invalid portfolio ID" }, 400);

  const portfolio = await c.env.DB.prepare(
    "SELECT id, currency FROM portfolios WHERE id = ? AND user_id = ? AND deleted_at IS NULL",
  )
    .bind(portfolioId, user.id)
    .first<{ id: number; currency: string }>();
  if (!portfolio) return c.json({ error: "Portfolio not found" }, 404);

  const body = (await c.req.json<{ token?: string; query_id?: string }>().catch(() => ({
    token: undefined,
    query_id: undefined,
  }))) as { token?: string; query_id?: string };

  if (!body.token || typeof body.token !== "string") {
    return c.json({ error: "Token is required" }, 400);
  }
  if (!body.query_id || typeof body.query_id !== "string") {
    return c.json({ error: "Query ID is required" }, 400);
  }

  const { IbkrFlexHttpClient } = await import("../clients/ibkr");
  const client: IbkrFlexClient = new IbkrFlexHttpClient();

  try {
    const result = await importIbkrStatement(
      c.env.DB,
      portfolioId,
      client,
      body.token,
      body.query_id,
    );
    return c.json({ data: result }, 201);
  } catch (e) {
    return c.json({ error: (e as Error).message }, 502);
  }
});

export default importRoutes;
