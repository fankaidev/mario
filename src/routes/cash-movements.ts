import { Hono } from "hono";
import type { AuthVariables } from "../middleware/auth";
import type { Bindings } from "../types";
import type { CashMovement, CashMovementType } from "../../shared/types/api";

const cashMovements = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>();

cashMovements.get("/", async (c) => {
  const user = c.get("user");
  const portfolioId = parseInt(c.req.param("portfolioId") ?? "", 10);
  if (isNaN(portfolioId)) return c.json({ error: "Invalid portfolio ID" }, 400);

  const portfolio = await c.env.DB.prepare(
    "SELECT id FROM portfolios WHERE id = ? AND user_id = ? AND deleted_at IS NULL",
  )
    .bind(portfolioId, user.id)
    .first();
  if (!portfolio) return c.json({ error: "Portfolio not found" }, 404);

  const [txRows, transferRows] = await Promise.all([
    c.env.DB.prepare(
      "SELECT id, symbol, type, quantity, price, fee, date, created_at FROM transactions WHERE portfolio_id = ?",
    )
      .bind(portfolioId)
      .all<{
        id: number;
        symbol: string;
        type: string;
        quantity: number;
        price: number;
        fee: number;
        date: string;
        created_at: string;
      }>(),
    c.env.DB.prepare(
      "SELECT id, type, amount, fee, date, note, created_at FROM transfers WHERE portfolio_id = ?",
    )
      .bind(portfolioId)
      .all<{
        id: number;
        type: string;
        amount: number;
        fee: number;
        date: string;
        note: string | null;
        created_at: string;
      }>(),
  ]);

  type CashEvent = {
    date: string;
    created_at: string;
    cash_delta: number;
    kind: "transfer" | "transaction";
    id: number;
    type: CashMovementType;
    symbol: string | null;
    note: string | null;
  };

  const events: CashEvent[] = [];

  for (const tr of transferRows.results) {
    const delta =
      tr.type === "deposit" || tr.type === "initial" ? tr.amount - tr.fee : -(tr.amount + tr.fee);
    events.push({
      date: tr.date,
      created_at: tr.created_at,
      cash_delta: delta,
      kind: "transfer",
      id: tr.id,
      type: tr.type as CashMovementType,
      symbol: null,
      note: tr.note,
    });
  }

  for (const tx of txRows.results) {
    let delta: number;
    if (tx.type === "buy" || tx.type === "initial") {
      delta = -(tx.quantity * tx.price + tx.fee);
    } else {
      // sell and dividend: quantity * price - fee
      delta = tx.quantity * tx.price - tx.fee;
    }
    events.push({
      date: tx.date,
      created_at: tx.created_at,
      cash_delta: delta,
      kind: "transaction",
      id: tx.id,
      type: tx.type as CashMovementType,
      symbol: tx.symbol,
      note: null,
    });
  }

  events.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.created_at.localeCompare(b.created_at);
  });

  const movements: CashMovement[] = [];
  let runningBalance = 0;
  for (const ev of events) {
    runningBalance += ev.cash_delta;
    movements.push({
      id: ev.id,
      date: ev.date,
      type: ev.type,
      symbol: ev.symbol,
      note: ev.note,
      amount: Math.round(ev.cash_delta * 100) / 100,
      cash_balance: Math.round(runningBalance * 100) / 100,
    });
  }

  movements.reverse();

  return c.json({ data: movements });
});

export default cashMovements;
