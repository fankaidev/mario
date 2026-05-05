import { Hono } from "hono";
import type { AuthVariables } from "../middleware/auth";
import type { Bindings } from "../types";
import type {
  CreateTransactionRequest,
  Transaction,
  TransactionType,
} from "../../shared/types/api";
import { replayFIFO, type CorporateAction } from "../lib/fifo";
import { syncPriceHistory } from "./prices";
import { FetcherRouter } from "../clients/fetcher-router";
import type { PriceFetcher } from "../clients/price-fetcher";

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
    if (typeof fee !== "number") throw { status: 400, message: "Fee must be a number" };
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

  if (typeof quantity !== "number" || quantity < 0) {
    throw { status: 400, message: "Quantity must be 0 or greater" };
  }

  if (typeof price !== "number" || price < 0) {
    throw { status: 400, message: "Price must be 0 or greater" };
  }

  // For dividend, quantity can be 0 (but other types require quantity > 0)
  if (txType !== "dividend" && quantity <= 0) {
    throw { status: 400, message: "Quantity must be greater than 0" };
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
    "SELECT id FROM portfolios WHERE id = ? AND user_id = ? AND deleted_at IS NULL",
  )
    .bind(portfolioId, user.id)
    .first<{ id: number }>();
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
    return handleBuy(c, portfolioId, body, user.id);
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

  const portfolio = await c.env.DB.prepare(
    "SELECT id FROM portfolios WHERE id = ? AND user_id = ? AND deleted_at IS NULL",
  )
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

  const portfolio = await c.env.DB.prepare(
    "SELECT id FROM portfolios WHERE id = ? AND user_id = ? AND deleted_at IS NULL",
  )
    .bind(portfolioId, user.id)
    .first();
  if (!portfolio) {
    return c.json({ error: "Portfolio not found" }, 404);
  }

  const startDate = c.req.query("startDate")?.trim();
  const endDate = c.req.query("endDate")?.trim();

  // Fetch transactions for this portfolio
  const txRows = await c.env.DB.prepare(
    "SELECT t.id, t.portfolio_id, t.symbol, t.type, t.quantity, t.price, t.fee, t.date, t.created_at, COALESCE(s.name, t.symbol) AS name FROM transactions t LEFT JOIN stocks s ON t.symbol = s.symbol WHERE t.portfolio_id = ? ORDER BY date DESC, created_at DESC",
  )
    .bind(portfolioId)
    .all<Transaction>();

  // Filter transactions by date range
  let filteredTx = txRows.results;
  if (startDate) {
    filteredTx = filteredTx.filter((tx) => tx.date >= startDate);
  }
  if (endDate) {
    filteredTx = filteredTx.filter((tx) => tx.date <= endDate);
  }

  return c.json({ data: filteredTx });
});

transactions.delete("/:txId", async (c) => {
  const user = c.get("user");
  const portfolioId = parseInt(c.req.param("portfolioId") ?? "", 10);
  const txId = parseInt(c.req.param("txId") ?? "", 10);
  if (isNaN(portfolioId) || isNaN(txId)) {
    return c.json({ error: "Invalid ID" }, 400);
  }

  const portfolio = await c.env.DB.prepare(
    "SELECT id FROM portfolios WHERE id = ? AND user_id = ? AND deleted_at IS NULL",
  )
    .bind(portfolioId, user.id)
    .first<{ id: number }>();
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

  // Simply delete the transaction - FIFO replay will handle the rest
  await c.env.DB.prepare("DELETE FROM transactions WHERE id = ?").bind(txId).run();

  return c.json({ data: null });
});

async function handleBuy(
  c: {
    env: { DB: D1Database; FINNHUB_API_KEY?: string };
    json: (obj: unknown, status: number) => Response;
  },
  portfolioId: number,
  body: CreateTransactionRequest,
  userId: number,
) {
  // Check if this is a new symbol for the user and backfill price history
  const existing = await c.env.DB.prepare(
    "SELECT COUNT(*) as cnt FROM transactions t JOIN portfolios p ON t.portfolio_id = p.id WHERE p.user_id = ? AND t.symbol = ?",
  )
    .bind(userId, body.symbol)
    .first<{ cnt: number }>();

  if (existing && existing.cnt === 0) {
    const apiKey = c.env.FINNHUB_API_KEY;
    if (apiKey) {
      const finnhub: PriceFetcher = {
        async fetchPrice(symbol: string) {
          const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}`, {
            headers: { "X-Finnhub-Token": apiKey },
          });
          if (res.ok) {
            const body = (await res.json()) as { c: number };
            if (typeof body.c === "number" && body.c >= 0) return body.c;
          }
          return null;
        },
        async fetchName(symbol: string) {
          const res = await fetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${symbol}`, {
            headers: { "X-Finnhub-Token": apiKey },
          });
          if (res.ok) {
            const body = (await res.json()) as { name: string };
            if (typeof body.name === "string" && body.name.length > 0) return body.name;
          }
          return null;
        },
      };
      const fetcher = new FetcherRouter(finnhub);
      try {
        await syncPriceHistory(c.env.DB, fetcher, body.symbol, "2024-01-01");
      } catch {
        // Backfill is best-effort; don't block the transaction
      }
    }
  }

  const txResult = await c.env.DB.prepare(
    "INSERT INTO transactions (portfolio_id, symbol, type, quantity, price, fee, date) VALUES (?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(portfolioId, body.symbol, body.type, body.quantity, body.price, body.fee, body.date)
    .run();

  const transaction = await c.env.DB.prepare(
    "SELECT id, portfolio_id, symbol, type, quantity, price, fee, date, created_at FROM transactions WHERE id = ?",
  )
    .bind(txResult.meta.last_row_id)
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
  // Get all transactions and corporate actions to validate sufficient quantity via FIFO replay
  const txRows = await c.env.DB.prepare(
    "SELECT id, portfolio_id, symbol, type, quantity, price, fee, date, created_at FROM transactions WHERE portfolio_id = ? ORDER BY date, created_at",
  )
    .bind(portfolioId)
    .all<Transaction>();

  const caRows = await c.env.DB.prepare(
    "SELECT id, symbol, type, ratio, effective_date FROM corporate_actions WHERE portfolio_id = ? ORDER BY effective_date, id",
  )
    .bind(portfolioId)
    .all<{ id: number; symbol: string; type: string; ratio: number; effective_date: string }>();

  const corporateActions: CorporateAction[] = caRows.results.map((row) => ({
    id: row.id,
    symbol: row.symbol,
    type: row.type as "split" | "merge",
    ratio: row.ratio,
    effective_date: row.effective_date,
  }));

  const { lots } = replayFIFO(txRows.results, corporateActions);

  const symbolLots = lots.filter((l) => l.symbol === body.symbol && l.remaining_quantity > 0);
  const totalRemaining = symbolLots.reduce((sum, l) => sum + l.remaining_quantity, 0);

  if (totalRemaining < body.quantity!) {
    return c.json({ error: "Insufficient quantity" }, 400);
  }

  const txResult = await c.env.DB.prepare(
    "INSERT INTO transactions (portfolio_id, symbol, type, quantity, price, fee, date) VALUES (?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(portfolioId, body.symbol, body.type, body.quantity, body.price, body.fee, body.date)
    .run();

  const transaction = await c.env.DB.prepare(
    "SELECT id, portfolio_id, symbol, type, quantity, price, fee, date, created_at FROM transactions WHERE id = ?",
  )
    .bind(txResult.meta.last_row_id)
    .first<Transaction>();

  return c.json({ data: transaction }, 201);
}

async function handleDividend(
  c: { env: { DB: D1Database }; json: (obj: unknown, status: number) => Response },
  portfolioId: number,
  body: CreateTransactionRequest,
) {
  const txResult = await c.env.DB.prepare(
    "INSERT INTO transactions (portfolio_id, symbol, type, quantity, price, fee, date) VALUES (?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(portfolioId, body.symbol, body.type, body.quantity, body.price, body.fee, body.date)
    .run();

  const transaction = await c.env.DB.prepare(
    "SELECT id, portfolio_id, symbol, type, quantity, price, fee, date, created_at FROM transactions WHERE id = ?",
  )
    .bind(txResult.meta.last_row_id)
    .first<Transaction>();

  return c.json({ data: transaction }, 201);
}

export default transactions;
