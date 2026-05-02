import { Hono } from "hono";
import type { AuthVariables } from "../middleware/auth";
import type { Bindings } from "../types";
import type {
  CreateTransactionRequest,
  Transaction,
  TransactionType,
} from "../../shared/types/api";

const transactions = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>();

type ValidationError = { status: number; message: string };

function parseBody(body: unknown): CreateTransactionRequest {
  if (!body || typeof body !== "object") throw { status: 400, message: "Request body is required" };

  const { symbol, type, quantity, price, fee, date } = body as {
    symbol?: unknown;
    type?: unknown;
    quantity?: unknown;
    price?: unknown;
    fee?: unknown;
    date?: unknown;
  };

  const validTypes: TransactionType[] = ["buy", "sell", "dividend", "initial"];
  if (!validTypes.includes(type as TransactionType)) {
    throw { status: 400, message: "Invalid transaction type" };
  }
  const txType = type as TransactionType;

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

  if (!symbol || typeof symbol !== "string" || symbol.trim().length === 0) {
    throw { status: 400, message: "Symbol is required" };
  }

  if (txType === "dividend") {
    if (typeof price !== "number" || price < 0) {
      throw { status: 400, message: "Price must be 0 or greater" };
    }
    return { symbol: symbol.trim(), type: txType, quantity: 0, price, fee: parsedFee, date };
  }

  if (typeof quantity !== "number" || quantity <= 0) {
    throw { status: 400, message: "Quantity must be greater than 0" };
  }

  if (typeof price !== "number" || price < 0) {
    throw { status: 400, message: "Price must be 0 or greater" };
  }

  return { symbol: symbol.trim(), type: txType, quantity, price, fee: parsedFee, date };
}

function parsePortfolioId(c: { req: { param: (name: string) => string | undefined } }): number {
  const id = parseInt(c.req.param("portfolioId") ?? "", 10);
  if (isNaN(id)) throw { status: 400, message: "Invalid portfolio ID" };
  return id;
}

transactions.post("/", async (c) => {
  const user = c.get("user");

  let portfolioId: number;
  try {
    portfolioId = parsePortfolioId(c);
  } catch (e) {
    const err = e as ValidationError;
    return c.json({ error: err.message }, err.status as 400);
  }

  const portfolio = await c.env.DB.prepare(
    "SELECT id, cash_balance FROM portfolios WHERE id = ? AND user_id = ?",
  )
    .bind(portfolioId, user.id)
    .first<{ id: number; cash_balance: number }>();
  if (!portfolio) {
    return c.json({ error: "Portfolio not found" }, 404);
  }

  let body: CreateTransactionRequest;
  try {
    body = parseBody(await c.req.json());
  } catch (e) {
    const err = e as ValidationError;
    return c.json({ error: err.message }, err.status as 400);
  }

  if (body.type === "buy" || body.type === "initial") {
    return handleBuy(c, portfolioId, body);
  }
  if (body.type === "sell") {
    return handleSell(c, portfolioId, body);
  }
  return handleDividend(c, portfolioId, body);
});

transactions.get("/symbols", async (c) => {
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

  const rows = await c.env.DB.prepare(
    "SELECT DISTINCT symbol FROM transactions WHERE portfolio_id = ? ORDER BY symbol",
  )
    .bind(portfolioId)
    .all<{ symbol: string }>();

  return c.json({ data: rows.results.map((r) => r.symbol) });
});

transactions.get("/", async (c) => {
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

  const symbolParam = c.req.query("symbol")?.trim().toUpperCase();
  const symbols = symbolParam
    ? symbolParam
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  const startDate = c.req.query("startDate")?.trim();
  const endDate = c.req.query("endDate")?.trim();
  const typeParam = c.req.query("type")?.trim().toLowerCase();
  const validTypes: TransactionType[] = ["buy", "sell", "dividend", "initial"];
  const types = typeParam
    ? typeParam
        .split(",")
        .map((t) => t.trim())
        .filter((t): t is TransactionType => validTypes.includes(t as TransactionType))
    : [];

  let query =
    "SELECT t.id, t.portfolio_id, t.symbol, t.type, t.quantity, t.price, t.fee, t.date, t.created_at, COALESCE(s.name, t.symbol) AS name FROM transactions t LEFT JOIN stocks s ON t.symbol = s.symbol WHERE t.portfolio_id = ?";
  const params: (number | string)[] = [portfolioId];

  if (symbols.length === 1) {
    query += " AND t.symbol = ?";
    params.push(symbols[0]!);
  } else if (symbols.length > 1) {
    query += ` AND t.symbol IN (${symbols.map(() => "?").join(", ")})`;
    params.push(...symbols);
  }

  if (types.length === 1) {
    query += " AND t.type = ?";
    params.push(types[0]!);
  } else if (types.length > 1) {
    query += ` AND t.type IN (${types.map(() => "?").join(", ")})`;
    params.push(...types);
  }

  if (startDate) {
    query += " AND t.date >= ?";
    params.push(startDate);
  }

  if (endDate) {
    query += " AND t.date <= ?";
    params.push(endDate);
  }

  query += " ORDER BY date DESC, created_at DESC";

  const rows = await c.env.DB.prepare(query)
    .bind(...params)
    .all<Transaction>();

  return c.json({ data: rows.results });
});

transactions.delete("/:txId", async (c) => {
  const user = c.get("user");
  const portfolioId = parseInt(c.req.param("portfolioId") ?? "", 10);
  const txId = parseInt(c.req.param("txId") ?? "", 10);
  if (isNaN(portfolioId) || isNaN(txId)) {
    return c.json({ error: "Invalid ID" }, 400);
  }

  const portfolio = await c.env.DB.prepare(
    "SELECT id, cash_balance FROM portfolios WHERE id = ? AND user_id = ?",
  )
    .bind(portfolioId, user.id)
    .first<{ id: number; cash_balance: number }>();
  if (!portfolio) {
    return c.json({ error: "Portfolio not found" }, 404);
  }

  const tx = await c.env.DB.prepare(
    "SELECT id, type, price, fee, quantity FROM transactions WHERE id = ? AND portfolio_id = ?",
  )
    .bind(txId, portfolioId)
    .first<{ id: number; type: string; price: number; fee: number; quantity: number | null }>();
  if (!tx) {
    return c.json({ error: "Transaction not found" }, 404);
  }

  const statements: D1PreparedStatement[] = [];

  if (tx.type === "buy" || tx.type === "initial") {
    const costBasis = tx.quantity! * tx.price + tx.fee;
    statements.push(
      c.env.DB.prepare("DELETE FROM lots WHERE transaction_id = ?").bind(txId),
      c.env.DB.prepare("UPDATE portfolios SET cash_balance = cash_balance + ? WHERE id = ?").bind(
        costBasis,
        portfolioId,
      ),
    );
  } else if (tx.type === "sell") {
    const proceeds = tx.quantity! * tx.price - tx.fee;

    const pnlRows = await c.env.DB.prepare(
      "SELECT lot_id, quantity FROM realized_pnl WHERE sell_transaction_id = ?",
    )
      .bind(txId)
      .all<{ lot_id: number; quantity: number }>();

    for (const row of pnlRows.results) {
      statements.push(
        c.env.DB.prepare(
          "UPDATE lots SET remaining_quantity = remaining_quantity + ?, closed = 0 WHERE id = ?",
        ).bind(row.quantity, row.lot_id),
      );
    }
    statements.push(
      c.env.DB.prepare("DELETE FROM realized_pnl WHERE sell_transaction_id = ?").bind(txId),
      c.env.DB.prepare("UPDATE portfolios SET cash_balance = cash_balance - ? WHERE id = ?").bind(
        proceeds,
        portfolioId,
      ),
    );
  } else if (tx.type === "dividend") {
    const cashChange = tx.price - tx.fee;
    statements.push(
      c.env.DB.prepare("UPDATE portfolios SET cash_balance = cash_balance - ? WHERE id = ?").bind(
        cashChange,
        portfolioId,
      ),
    );
  }

  statements.push(c.env.DB.prepare("DELETE FROM transactions WHERE id = ?").bind(txId));

  await c.env.DB.batch(statements);

  return c.json({ data: null });
});

async function handleBuy(
  c: { env: { DB: D1Database }; json: (obj: unknown, status: number) => Response },
  portfolioId: number,
  body: CreateTransactionRequest,
) {
  const costBasis = body.quantity! * body.price + body.fee;

  const txResult = await c.env.DB.prepare(
    "INSERT INTO transactions (portfolio_id, symbol, type, quantity, price, fee, date) VALUES (?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(portfolioId, body.symbol, body.type, body.quantity, body.price, body.fee, body.date)
    .run();

  const txId = txResult.meta.last_row_id;

  await c.env.DB.batch([
    c.env.DB.prepare(
      "INSERT INTO lots (transaction_id, portfolio_id, symbol, quantity, remaining_quantity, cost_basis) VALUES (?, ?, ?, ?, ?, ?)",
    ).bind(txId, portfolioId, body.symbol, body.quantity, body.quantity, costBasis),
    c.env.DB.prepare("UPDATE portfolios SET cash_balance = cash_balance - ? WHERE id = ?").bind(
      costBasis,
      portfolioId,
    ),
  ]);

  const transaction = await c.env.DB.prepare(
    "SELECT id, portfolio_id, symbol, type, quantity, price, fee, date, created_at FROM transactions WHERE id = ?",
  )
    .bind(txId)
    .first<Transaction>();

  return new Response(JSON.stringify({ data: transaction }), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
}

async function handleSell(
  c: { env: { DB: D1Database }; json: (obj: unknown, status: number) => Response },
  portfolioId: number,
  body: CreateTransactionRequest,
) {
  const lots = await c.env.DB.prepare(
    "SELECT id, quantity, remaining_quantity, cost_basis FROM lots WHERE portfolio_id = ? AND symbol = ? AND closed = 0 ORDER BY created_at ASC",
  )
    .bind(portfolioId, body.symbol)
    .all<{ id: number; quantity: number; remaining_quantity: number; cost_basis: number }>();

  const totalRemaining = lots.results.reduce((sum, l) => sum + l.remaining_quantity, 0);
  if (totalRemaining < body.quantity!) {
    return c.json({ error: "Insufficient quantity" }, 400);
  }

  const txResult = await c.env.DB.prepare(
    "INSERT INTO transactions (portfolio_id, symbol, type, quantity, price, fee, date) VALUES (?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(portfolioId, body.symbol, body.type, body.quantity, body.price, body.fee, body.date)
    .run();

  const txId = txResult.meta.last_row_id;

  const proceeds = body.quantity! * body.price - body.fee;

  const statements: D1PreparedStatement[] = [];
  let remainingToSell = body.quantity!;
  for (const lot of lots.results) {
    if (remainingToSell <= 0) break;

    const consumed = Math.min(lot.remaining_quantity, remainingToSell);
    const newRemaining = lot.remaining_quantity - consumed;
    const closed = newRemaining === 0 ? 1 : 0;

    statements.push(
      c.env.DB.prepare("UPDATE lots SET remaining_quantity = ?, closed = ? WHERE id = ?").bind(
        newRemaining,
        closed,
        lot.id,
      ),
    );

    const lotProceeds = body.price * consumed - body.fee * (consumed / body.quantity!);
    const cost = (lot.cost_basis / lot.quantity) * consumed;
    const pnl = lotProceeds - cost;
    const costPerShare = lot.cost_basis / lot.quantity;

    statements.push(
      c.env.DB.prepare(
        "INSERT INTO realized_pnl (sell_transaction_id, lot_id, quantity, proceeds, cost, pnl, sell_price, cost_per_share) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      ).bind(txId, lot.id, consumed, lotProceeds, cost, pnl, body.price, costPerShare),
    );

    remainingToSell -= consumed;
  }

  statements.push(
    c.env.DB.prepare("UPDATE portfolios SET cash_balance = cash_balance + ? WHERE id = ?").bind(
      proceeds,
      portfolioId,
    ),
  );

  await c.env.DB.batch(statements);

  const transaction = await c.env.DB.prepare(
    "SELECT id, portfolio_id, symbol, type, quantity, price, fee, date, created_at FROM transactions WHERE id = ?",
  )
    .bind(txId)
    .first<Transaction>();

  return c.json({ data: transaction }, 201);
}

async function handleDividend(
  c: { env: { DB: D1Database }; json: (obj: unknown, status: number) => Response },
  portfolioId: number,
  body: CreateTransactionRequest,
) {
  const cashChange = body.price - body.fee;

  const txResult = await c.env.DB.prepare(
    "INSERT INTO transactions (portfolio_id, symbol, type, quantity, price, fee, date) VALUES (?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(portfolioId, body.symbol, body.type, body.quantity, body.price, body.fee, body.date)
    .run();

  await c.env.DB.prepare("UPDATE portfolios SET cash_balance = cash_balance + ? WHERE id = ?")
    .bind(cashChange, portfolioId)
    .run();

  const transaction = await c.env.DB.prepare(
    "SELECT id, portfolio_id, symbol, type, quantity, price, fee, date, created_at FROM transactions WHERE id = ?",
  )
    .bind(txResult.meta.last_row_id)
    .first<Transaction>();

  return c.json({ data: transaction }, 201);
}

export default transactions;
