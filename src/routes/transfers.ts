import { Hono } from "hono";
import type { AuthVariables } from "../middleware/auth";
import type { Bindings } from "../types";
import type { Transfer, TransferType } from "../../shared/types/api";

const transfers = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>();

transfers.post("/", async (c) => {
  const user = c.get("user");
  const portfolioId = parseInt(c.req.param("portfolioId") ?? "", 10);
  if (isNaN(portfolioId)) return c.json({ error: "Invalid portfolio ID" }, 400);

  const portfolio = await c.env.DB.prepare(
    "SELECT id, cash_balance FROM portfolios WHERE id = ? AND user_id = ?",
  )
    .bind(portfolioId, user.id)
    .first<{ id: number; cash_balance: number }>();
  if (!portfolio) return c.json({ error: "Portfolio not found" }, 404);

  const body = await c.req.json<{
    type?: string;
    amount?: number;
    fee?: number;
    date?: string;
    note?: string;
  }>();

  if (body.type !== "deposit" && body.type !== "withdrawal") {
    return c.json({ error: "Type must be deposit or withdrawal" }, 400);
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
  const transferType = body.type as TransferType;

  if (transferType === "deposit") {
    const cashChange = body.amount - fee;

    const result = await c.env.DB.prepare(
      "INSERT INTO transfers (portfolio_id, type, amount, fee, date, note) VALUES (?, ?, ?, ?, ?, ?)",
    )
      .bind(portfolioId, transferType, body.amount, fee, body.date, body.note ?? null)
      .run();

    await c.env.DB.prepare("UPDATE portfolios SET cash_balance = cash_balance + ? WHERE id = ?")
      .bind(cashChange, portfolioId)
      .run();

    const transfer = await c.env.DB.prepare(
      "SELECT id, portfolio_id, type, amount, fee, date, note, created_at FROM transfers WHERE id = ?",
    )
      .bind(result.meta.last_row_id)
      .first<Transfer>();

    return c.json({ data: transfer }, 201);
  }

  // withdrawal
  const cashChange = body.amount + fee;
  if (portfolio.cash_balance < cashChange) {
    return c.json({ error: "Insufficient cash balance" }, 400);
  }

  const result = await c.env.DB.prepare(
    "INSERT INTO transfers (portfolio_id, type, amount, fee, date, note) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(portfolioId, transferType, body.amount, fee, body.date, body.note ?? null)
    .run();

  await c.env.DB.prepare("UPDATE portfolios SET cash_balance = cash_balance - ? WHERE id = ?")
    .bind(cashChange, portfolioId)
    .run();

  const transfer = await c.env.DB.prepare(
    "SELECT id, portfolio_id, type, amount, fee, date, note, created_at FROM transfers WHERE id = ?",
  )
    .bind(result.meta.last_row_id)
    .first<Transfer>();

  return c.json({ data: transfer }, 201);
});

transfers.get("/", async (c) => {
  const user = c.get("user");
  const portfolioId = parseInt(c.req.param("portfolioId") ?? "", 10);
  if (isNaN(portfolioId)) return c.json({ error: "Invalid portfolio ID" }, 400);

  const portfolio = await c.env.DB.prepare("SELECT id FROM portfolios WHERE id = ? AND user_id = ?")
    .bind(portfolioId, user.id)
    .first();
  if (!portfolio) return c.json({ error: "Portfolio not found" }, 404);

  const rows = await c.env.DB.prepare(
    "SELECT id, portfolio_id, type, amount, fee, date, note, created_at FROM transfers WHERE portfolio_id = ? ORDER BY date DESC, created_at DESC",
  )
    .bind(portfolioId)
    .all<Transfer>();

  return c.json({ data: rows.results });
});

transfers.delete("/:transferId", async (c) => {
  const user = c.get("user");
  const portfolioId = parseInt(c.req.param("portfolioId") ?? "", 10);
  const transferId = parseInt(c.req.param("transferId") ?? "", 10);
  if (isNaN(portfolioId) || isNaN(transferId)) return c.json({ error: "Invalid ID" }, 400);

  const portfolio = await c.env.DB.prepare(
    "SELECT id, cash_balance FROM portfolios WHERE id = ? AND user_id = ?",
  )
    .bind(portfolioId, user.id)
    .first<{ id: number; cash_balance: number }>();
  if (!portfolio) return c.json({ error: "Portfolio not found" }, 404);

  const transfer = await c.env.DB.prepare(
    "SELECT id, type, amount, fee FROM transfers WHERE id = ? AND portfolio_id = ?",
  )
    .bind(transferId, portfolioId)
    .first<{ id: number; type: string; amount: number; fee: number }>();
  if (!transfer) return c.json({ error: "Transfer not found" }, 404);

  if (transfer.type === "deposit") {
    const cashChange = transfer.amount - transfer.fee;
    if (portfolio.cash_balance < cashChange) {
      return c.json({ error: "Would result in negative cash balance" }, 400);
    }
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE portfolios SET cash_balance = cash_balance - ? WHERE id = ?").bind(
        cashChange,
        portfolioId,
      ),
      c.env.DB.prepare("DELETE FROM transfers WHERE id = ?").bind(transferId),
    ]);
  } else {
    const cashChange = transfer.amount + transfer.fee;
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE portfolios SET cash_balance = cash_balance + ? WHERE id = ?").bind(
        cashChange,
        portfolioId,
      ),
      c.env.DB.prepare("DELETE FROM transfers WHERE id = ?").bind(transferId),
    ]);
  }

  return c.json({ data: null });
});

export default transfers;
