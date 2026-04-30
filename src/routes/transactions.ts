import { Hono } from "hono";
import type { AuthVariables } from "../middleware/auth";
import type { CreateTransactionRequest, Transaction } from "../../shared/types/api";

type Bindings = {
  DB: D1Database;
};

const transactions = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>();

type ValidationError = { status: number; message: string };

function parseBuyBody(body: unknown): CreateTransactionRequest {
  if (!body || typeof body !== "object") throw { status: 400, message: "Request body is required" };

  const { symbol, type, quantity, price, fee, date } = body as {
    symbol?: unknown;
    type?: unknown;
    quantity?: unknown;
    price?: unknown;
    fee?: unknown;
    date?: unknown;
  };

  if (!symbol || typeof symbol !== "string" || symbol.trim().length === 0) {
    throw { status: 400, message: "Symbol is required" };
  }

  if (type !== "buy") {
    throw { status: 400, message: "Invalid transaction type" };
  }

  if (typeof quantity !== "number" || quantity <= 0) {
    throw { status: 400, message: "Quantity must be greater than 0" };
  }

  if (typeof price !== "number" || price < 0) {
    throw { status: 400, message: "Price must be 0 or greater" };
  }

  const parsedFee = ((): number => {
    if (fee === undefined || fee === null) return 0;
    if (typeof fee !== "number" || fee < 0)
      throw { status: 400, message: "Fee must be 0 or greater" };
    return fee;
  })();

  if (!date || typeof date !== "string") {
    throw { status: 400, message: "Date is required" };
  }
  if (isNaN(Date.parse(date))) {
    throw { status: 400, message: "Invalid date format" };
  }
  if (new Date(date) > new Date()) {
    throw { status: 400, message: "Date cannot be in the future" };
  }

  return { symbol: symbol.trim(), type: "buy", quantity, price, fee: parsedFee, date };
}

transactions.post("/", async (c) => {
  const user = c.get("user");
  const portfolioId = parseInt(c.req.param("portfolioId") ?? "", 10);
  if (isNaN(portfolioId)) {
    return c.json({ error: "Invalid portfolio ID" }, 400);
  }

  const portfolio = await c.env.DB.prepare("SELECT id FROM portfolios WHERE id = ? AND user_id = ?")
    .bind(portfolioId, user.id)
    .first();
  if (!portfolio) {
    return c.json({ error: "Portfolio not found" }, 404);
  }

  let body: CreateTransactionRequest;
  try {
    body = parseBuyBody(await c.req.json());
  } catch (e) {
    const err = e as ValidationError;
    return c.json({ error: err.message }, err.status as 400);
  }

  const costBasis = body.quantity * body.price + body.fee;

  const txResult = await c.env.DB.prepare(
    "INSERT INTO transactions (portfolio_id, symbol, type, quantity, price, fee, date) VALUES (?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(portfolioId, body.symbol, body.type, body.quantity, body.price, body.fee, body.date)
    .run();

  const txId = txResult.meta.last_row_id;

  await c.env.DB.prepare(
    "INSERT INTO lots (transaction_id, portfolio_id, symbol, quantity, remaining_quantity, cost_basis) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(txId, portfolioId, body.symbol, body.quantity, body.quantity, costBasis)
    .run();

  const transaction = await c.env.DB.prepare(
    "SELECT id, portfolio_id, symbol, type, quantity, price, fee, date, created_at FROM transactions WHERE id = ?",
  )
    .bind(txId)
    .first<Transaction>();

  return c.json({ data: transaction }, 201);
});

export default transactions;
