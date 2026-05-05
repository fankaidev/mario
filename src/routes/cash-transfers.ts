import { Hono } from "hono";
import type { AuthVariables } from "../middleware/auth";
import type { Bindings } from "../types";
import type { CashTransfer, CashTransferType } from "../../shared/types/api";
import { calculateCashBalance } from "./portfolios";

const cashTransfers = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>();

cashTransfers.post("/", async (c) => {
  const user = c.get("user");
  const portfolioId = parseInt(c.req.param("portfolioId") ?? "", 10);
  if (isNaN(portfolioId)) return c.json({ error: "Invalid portfolio ID" }, 400);

  const portfolio = await c.env.DB.prepare(
    "SELECT id FROM portfolios WHERE id = ? AND user_id = ? AND deleted_at IS NULL",
  )
    .bind(portfolioId, user.id)
    .first<{ id: number }>();
  if (!portfolio) return c.json({ error: "Portfolio not found" }, 404);

  const body = await c.req.json<{
    type?: string;
    amount?: number;
    fee?: number;
    date?: string;
    note?: string;
  }>();

  if (!["deposit", "withdrawal", "initial", "interest"].includes(body.type ?? "")) {
    return c.json({ error: "Type must be deposit, withdrawal, initial, or interest" }, 400);
  }
  if (typeof body.amount !== "number" || body.amount <= 0) {
    return c.json({ error: "Amount must be greater than 0" }, 400);
  }
  if (!body.date || typeof body.date !== "string") {
    return c.json({ error: "Date is required" }, 400);
  }
  if (isNaN(Date.parse(body.date))) {
    return c.json({ error: "Invalid date format" }, 400);
  }

  const fee = typeof body.fee === "number" && body.fee >= 0 ? body.fee : 0;
  const transferType = body.type as CashTransferType;

  // withdrawal validation: check if sufficient balance
  if (transferType === "withdrawal") {
    const cashChange = body.amount + fee;
    const currentCashBalance = await calculateCashBalance(c.env.DB, portfolioId);
    if (currentCashBalance < cashChange) {
      return c.json({ error: "Insufficient cash balance" }, 400);
    }
  }

  const result = await c.env.DB.prepare(
    "INSERT INTO cash_movements (portfolio_id, type, amount, fee, date, note) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(portfolioId, transferType, body.amount, fee, body.date, body.note ?? null)
    .run();

  const transfer = await c.env.DB.prepare(
    "SELECT id, portfolio_id, type, amount, fee, date, note, created_at FROM cash_movements WHERE id = ?",
  )
    .bind(result.meta.last_row_id)
    .first<CashTransfer>();

  return c.json({ data: transfer }, 201);
});

cashTransfers.get("/", async (c) => {
  const user = c.get("user");
  const portfolioId = parseInt(c.req.param("portfolioId") ?? "", 10);
  if (isNaN(portfolioId)) return c.json({ error: "Invalid portfolio ID" }, 400);

  const portfolio = await c.env.DB.prepare(
    "SELECT id FROM portfolios WHERE id = ? AND user_id = ? AND deleted_at IS NULL",
  )
    .bind(portfolioId, user.id)
    .first();
  if (!portfolio) return c.json({ error: "Portfolio not found" }, 404);

  const [allTransferRows, txRows] = await Promise.all([
    c.env.DB.prepare(
      "SELECT id, portfolio_id, type, amount, fee, date, note, created_at FROM cash_movements WHERE portfolio_id = ? ORDER BY date, created_at",
    )
      .bind(portfolioId)
      .all<CashTransfer>(),
    c.env.DB.prepare(
      "SELECT id, type, quantity, price, fee, date, created_at FROM transactions WHERE portfolio_id = ? ORDER BY date, created_at",
    )
      .bind(portfolioId)
      .all<{
        id: number;
        type: string;
        quantity: number;
        price: number;
        fee: number;
        date: string;
        created_at: string;
      }>(),
  ]);

  type CashEvent = {
    date: string;
    created_at: string;
    kind: "transfer" | "transaction";
    cash_delta: number;
    transfer_id?: number;
  };

  const events: CashEvent[] = [];

  for (const tr of allTransferRows.results) {
    const delta = tr.type === "withdrawal" ? -(tr.amount + tr.fee) : tr.amount - tr.fee;
    events.push({
      date: tr.date,
      created_at: tr.created_at,
      kind: "transfer",
      cash_delta: delta,
      transfer_id: tr.id,
    });
  }

  for (const tx of txRows.results) {
    let delta: number;
    if (tx.type === "buy" || tx.type === "initial") {
      delta = -(tx.quantity * tx.price + tx.fee);
    } else if (tx.type === "sell") {
      delta = tx.quantity * tx.price - tx.fee;
    } else {
      // dividend
      delta = tx.quantity * tx.price - tx.fee;
    }
    events.push({
      date: tx.date,
      created_at: tx.created_at,
      kind: "transaction",
      cash_delta: delta,
    });
  }

  events.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.created_at.localeCompare(b.created_at);
  });

  const balanceByTransferId = new Map<number, number>();
  let runningBalance = 0;
  for (const ev of events) {
    runningBalance += ev.cash_delta;
    if (ev.kind === "transfer" && ev.transfer_id !== undefined) {
      balanceByTransferId.set(ev.transfer_id, Math.round(runningBalance * 100) / 100);
    }
  }

  const result = allTransferRows.results
    .map((tr) => ({
      ...tr,
      cash_balance: balanceByTransferId.get(tr.id),
    }))
    .reverse();

  return c.json({ data: result });
});

cashTransfers.delete("/:transferId", async (c) => {
  const user = c.get("user");
  const portfolioId = parseInt(c.req.param("portfolioId") ?? "", 10);
  const transferId = parseInt(c.req.param("transferId") ?? "", 10);
  if (isNaN(portfolioId) || isNaN(transferId)) return c.json({ error: "Invalid ID" }, 400);

  const portfolio = await c.env.DB.prepare(
    "SELECT id FROM portfolios WHERE id = ? AND user_id = ? AND deleted_at IS NULL",
  )
    .bind(portfolioId, user.id)
    .first<{ id: number }>();
  if (!portfolio) return c.json({ error: "Portfolio not found" }, 404);

  const transfer = await c.env.DB.prepare(
    "SELECT id FROM cash_movements WHERE id = ? AND portfolio_id = ?",
  )
    .bind(transferId, portfolioId)
    .first<{ id: number }>();
  if (!transfer) return c.json({ error: "Transfer not found" }, 404);

  await c.env.DB.prepare("DELETE FROM cash_movements WHERE id = ?").bind(transferId).run();

  return c.json({ data: null });
});

export default cashTransfers;
