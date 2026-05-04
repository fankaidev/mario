import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPlatformProxy, unstable_dev } from "wrangler";
import type { UnstableDevWorker } from "wrangler";
import { cleanDatabase, ensureMigrations, createApiTokenForUser } from "./helpers";

let worker: UnstableDevWorker;
let db: D1Database;
let portfolioId: number;
let authToken: string;

beforeAll(async () => {
  const { env } = await getPlatformProxy<{ DB: D1Database }>();
  db = env.DB;
  await ensureMigrations(db);
  worker = await unstable_dev("src/index.ts", {
    config: "wrangler.toml",
    local: true,
  });
});

afterAll(async () => {
  await worker.stop();
});

beforeEach(async () => {
  await cleanDatabase(db);

  const userResult = await db
    .prepare("INSERT INTO users (email) VALUES (?) RETURNING id")
    .bind("test@example.com")
    .first<{ id: number }>();
  const userId = userResult!.id;
  authToken = await createApiTokenForUser(db, userId);

  const portfolioResult = await db
    .prepare("INSERT INTO portfolios (user_id, name, currency) VALUES (?, ?, ?) RETURNING id")
    .bind(userId, "US Stocks", "USD")
    .first<{ id: number }>();
  portfolioId = portfolioResult!.id;
});

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${authToken}` };
}

function buyPayload(symbol: string, quantity: number, price: number, date: string, fee?: number) {
  return { symbol, type: "buy", quantity, price, fee: fee ?? 0, date };
}

describe("Buy Transaction", () => {
  it("[UC-PORTFOLIO-002-S01] creates transaction and lot for buy", async () => {
    const res = await worker.fetch(`http://localhost/api/portfolios/${portfolioId}/transactions`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(buyPayload("AAPL", 100, 150, "2024-01-15", 5)),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      data: {
        id: number;
        symbol: string;
        type: string;
        quantity: number;
        price: number;
        fee: number;
      };
    };
    expect(body.data.symbol).toBe("AAPL");
    expect(body.data.type).toBe("buy");
    expect(body.data.quantity).toBe(100);
    expect(body.data.fee).toBe(5);

    // Verify lot created via holdings endpoint
    const holdingsRes = await worker.fetch(
      `http://localhost/api/portfolios/${portfolioId}/holdings`,
      { headers: authHeaders() },
    );
    const holdingsBody = (await holdingsRes.json()) as {
      data: Array<{ symbol: string; quantity: number; cost: number }>;
    };
    expect(holdingsBody.data).toHaveLength(1);
    expect(holdingsBody.data[0].symbol).toBe("AAPL");
    expect(holdingsBody.data[0].quantity).toBe(100);
    expect(holdingsBody.data[0].cost).toBe(100 * 150 + 5);
  });

  it("[UC-PORTFOLIO-002-S02] multiple buys create independent lots", async () => {
    await worker.fetch(`http://localhost/api/portfolios/${portfolioId}/transactions`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(buyPayload("AAPL", 100, 150, "2024-01-15", 5)),
    });

    const res2 = await worker.fetch(`http://localhost/api/portfolios/${portfolioId}/transactions`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(buyPayload("AAPL", 50, 160, "2024-02-10", 3)),
    });
    expect(res2.status).toBe(201);

    // Verify via holdings endpoint - should aggregate both lots
    const holdingsRes = await worker.fetch(
      `http://localhost/api/portfolios/${portfolioId}/holdings`,
      { headers: authHeaders() },
    );
    const holdingsBody = (await holdingsRes.json()) as {
      data: Array<{ symbol: string; quantity: number; cost: number }>;
    };
    expect(holdingsBody.data).toHaveLength(1);
    expect(holdingsBody.data[0].quantity).toBe(150); // 100 + 50
    expect(holdingsBody.data[0].cost).toBe(100 * 150 + 5 + 50 * 160 + 3); // 15005 + 8003 = 23008
  });

  it("returns 404 for non-existent portfolio", async () => {
    const res = await worker.fetch("http://localhost/api/portfolios/99999/transactions", {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(buyPayload("AAPL", 100, 150, "2024-01-15")),
    });
    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid input", async () => {
    const cases: Array<[string, unknown]> = [
      ["missing symbol", { type: "buy", quantity: 100, price: 150, date: "2024-01-15" }],
      [
        "quantity <= 0",
        { symbol: "AAPL", type: "buy", quantity: 0, price: 150, date: "2024-01-15" },
      ],
      [
        "future date",
        { symbol: "AAPL", type: "buy", quantity: 100, price: 150, date: "2099-01-01" },
      ],
    ];

    for (const [_desc, body] of cases) {
      const res = await worker.fetch(
        `http://localhost/api/portfolios/${portfolioId}/transactions`,
        {
          method: "POST",
          headers: { ...authHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      expect(res.status).toBe(400);
    }
  });
});

function sellPayload(symbol: string, quantity: number, price: number, date: string, fee?: number) {
  return { symbol, type: "sell", quantity, price, fee: fee ?? 0, date };
}

async function makeBuy(
  symbol: string,
  quantity: number,
  price: number,
  date: string,
  fee?: number,
) {
  const res = await worker.fetch(`http://localhost/api/portfolios/${portfolioId}/transactions`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(buyPayload(symbol, quantity, price, date, fee)),
  });
  return (await res.json()) as { data: { id: number } };
}

describe("Sell Transaction", () => {
  async function makeBuy(
    symbol: string,
    quantity: number,
    price: number,
    date: string,
    fee?: number,
  ) {
    const res = await worker.fetch(`http://localhost/api/portfolios/${portfolioId}/transactions`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(buyPayload(symbol, quantity, price, date, fee)),
    });
    return (await res.json()) as { data: { id: number } };
  }

  it("[UC-PORTFOLIO-002-S03] sells consume lots in FIFO order", async () => {
    await makeBuy("AAPL", 100, 150, "2024-01-15", 5);
    await makeBuy("AAPL", 50, 160, "2024-02-10", 3);

    const res = await worker.fetch(`http://localhost/api/portfolios/${portfolioId}/transactions`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(sellPayload("AAPL", 80, 170, "2024-03-01", 5)),
    });
    expect(res.status).toBe(201);

    // Verify via holdings - should have 70 shares remaining (100 - 80 from first lot, + 50 from second)
    const holdingsRes = await worker.fetch(
      `http://localhost/api/portfolios/${portfolioId}/holdings`,
      { headers: authHeaders() },
    );
    const holdingsBody = (await holdingsRes.json()) as {
      data: Array<{ symbol: string; quantity: number }>;
    };
    expect(holdingsBody.data[0].quantity).toBe(70); // 20 + 50

    // Verify via summary - check realized P&L was recorded
    const summaryRes = await worker.fetch(
      `http://localhost/api/portfolios/${portfolioId}/summary`,
      { headers: authHeaders() },
    );
    const summaryBody = (await summaryRes.json()) as {
      data: { realized_pnl: number };
    };
    expect(summaryBody.data.realized_pnl).toBeGreaterThan(0);
  });

  it("[UC-PORTFOLIO-002-S04] returns 400 for insufficient quantity", async () => {
    await makeBuy("AAPL", 100, 150, "2024-01-15");

    const res = await worker.fetch(`http://localhost/api/portfolios/${portfolioId}/transactions`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(sellPayload("AAPL", 150, 170, "2024-03-01")),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("Insufficient");
  });

  it("[UC-PORTFOLIO-002-S05] marks lot closed and calculates realized P&L", async () => {
    await makeBuy("AAPL", 100, 150, "2024-01-15", 5);
    await makeBuy("AAPL", 50, 160, "2024-02-10", 3);

    const res = await worker.fetch(`http://localhost/api/portfolios/${portfolioId}/transactions`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(sellPayload("AAPL", 20, 170, "2024-03-15", 5)),
    });
    expect(res.status).toBe(201);

    // Verify via holdings - should have 130 shares remaining
    const holdingsRes = await worker.fetch(
      `http://localhost/api/portfolios/${portfolioId}/holdings`,
      { headers: authHeaders() },
    );
    const holdingsBody = (await holdingsRes.json()) as {
      data: Array<{ quantity: number }>;
    };
    expect(holdingsBody.data[0].quantity).toBe(130); // 80 + 50

    // Verify realized P&L via summary
    const summaryRes = await worker.fetch(
      `http://localhost/api/portfolios/${portfolioId}/summary`,
      { headers: authHeaders() },
    );
    const summaryBody = (await summaryRes.json()) as {
      data: { realized_pnl: number };
    };
    // Expected: proceeds 3395 - cost 3001 - sell fee 5 = 389
    expect(summaryBody.data.realized_pnl).toBeCloseTo(389, 0);
  });
});

describe("Dividend Transaction", () => {
  function divPayload(
    symbol: string,
    perShare: number,
    quantity: number,
    withholdingTax: number,
    date: string,
  ) {
    return { symbol, type: "dividend", quantity, price: perShare, fee: withholdingTax, date };
  }

  it("[UC-PORTFOLIO-002-S06] creates dividend transaction without affecting lots", async () => {
    const res = await worker.fetch(`http://localhost/api/portfolios/${portfolioId}/transactions`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(divPayload("AAPL", 0.25, 400, 10, "2024-04-01")),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      data: { symbol: string; type: string; price: number; fee: number; quantity: number };
    };
    expect(body.data.symbol).toBe("AAPL");
    expect(body.data.type).toBe("dividend");
    expect(body.data.price).toBe(0.25);
    expect(body.data.quantity).toBe(400);
    expect(body.data.fee).toBe(10);

    // Verify no holdings created (dividend doesn't affect positions)
    const holdingsRes = await worker.fetch(
      `http://localhost/api/portfolios/${portfolioId}/holdings`,
      { headers: authHeaders() },
    );
    const holdingsBody = (await holdingsRes.json()) as { data: unknown[] };
    expect(holdingsBody.data).toHaveLength(0);
  });
});

describe("Initial Transaction", () => {
  function initialPayload(
    symbol: string,
    quantity: number,
    price: number,
    date: string,
    fee?: number,
  ) {
    return { symbol, type: "initial", quantity, price, fee: fee ?? 0, date };
  }

  it("[UC-PORTFOLIO-002-S09] creates transaction and lot for initial holding", async () => {
    const res = await worker.fetch(`http://localhost/api/portfolios/${portfolioId}/transactions`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(initialPayload("1810.HK", 800, 40, "2026-01-01", 0)),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      data: {
        id: number;
        symbol: string;
        type: string;
        quantity: number;
        price: number;
        fee: number;
      };
    };
    expect(body.data.symbol).toBe("1810.HK");
    expect(body.data.type).toBe("initial");
    expect(body.data.quantity).toBe(800);
    expect(body.data.price).toBe(40);
    expect(body.data.fee).toBe(0);

    // Verify lot created via holdings
    const holdingsRes = await worker.fetch(
      `http://localhost/api/portfolios/${portfolioId}/holdings`,
      { headers: authHeaders() },
    );
    const holdingsBody = (await holdingsRes.json()) as {
      data: Array<{ symbol: string; quantity: number; cost: number }>;
    };
    expect(holdingsBody.data[0].symbol).toBe("1810.HK");
    expect(holdingsBody.data[0].quantity).toBe(800);
    expect(holdingsBody.data[0].cost).toBe(800 * 40);
  });

  it("deleting an initial transaction removes the lot", async () => {
    const res = await worker.fetch(`http://localhost/api/portfolios/${portfolioId}/transactions`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(initialPayload("1810.HK", 800, 40, "2026-01-01")),
    });
    const { data: tx } = (await res.json()) as { data: { id: number } };

    // Verify holding exists before deletion
    const holdingsBefore = await worker.fetch(
      `http://localhost/api/portfolios/${portfolioId}/holdings`,
      { headers: authHeaders() },
    );
    const holdingsBeforeBody = (await holdingsBefore.json()) as { data: unknown[] };
    expect(holdingsBeforeBody.data).toHaveLength(1);

    const delRes = await worker.fetch(
      `http://localhost/api/portfolios/${portfolioId}/transactions/${tx.id}`,
      {
        method: "DELETE",
        headers: authHeaders(),
      },
    );
    expect(delRes.status).toBe(200);

    // Verify holding removed after deletion
    const holdingsAfter = await worker.fetch(
      `http://localhost/api/portfolios/${portfolioId}/holdings`,
      { headers: authHeaders() },
    );
    const holdingsAfterBody = (await holdingsAfter.json()) as { data: unknown[] };
    expect(holdingsAfterBody.data).toHaveLength(0);

    const txAfter = await db
      .prepare("SELECT id FROM transactions WHERE id = ?")
      .bind(tx.id)
      .first();
    expect(txAfter).toBeNull();
  });
});

describe("Transaction History", () => {
  async function getTransactions() {
    const res = await worker.fetch(`http://localhost/api/portfolios/${portfolioId}/transactions`, {
      headers: authHeaders(),
    });
    return (await res.json()) as { data: Array<{ id: number; type: string; date: string }> };
  }

  async function getTransactionsWithParams(params: string) {
    const res = await worker.fetch(
      `http://localhost/api/portfolios/${portfolioId}/transactions${params}`,
      { headers: authHeaders() },
    );
    return (await res.json()) as { data: Array<{ id: number; type: string; date: string }> };
  }

  async function deleteTransaction(txId: number) {
    return worker.fetch(`http://localhost/api/portfolios/${portfolioId}/transactions/${txId}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
  }

  it("[UC-PORTFOLIO-004-S01] lists transactions sorted by date DESC", async () => {
    const dates = ["2024-01-15", "2024-02-20", "2024-03-10"];
    for (const date of dates) {
      await worker.fetch(`http://localhost/api/portfolios/${portfolioId}/transactions`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(buyPayload("AAPL", 10, 150, date)),
      });
    }

    const body = await getTransactions();
    expect(body.data).toHaveLength(3);
    expect(body.data[0].date).toBe("2024-03-10");
    expect(body.data[1].date).toBe("2024-02-20");
    expect(body.data[2].date).toBe("2024-01-15");
  });

  it("[UC-PORTFOLIO-004-S02] deleting a buy removes the lot", async () => {
    const { data: tx } = await makeBuy("AAPL", 100, 150, "2024-01-15", 5);

    // Verify holding exists
    const holdingsBefore = await worker.fetch(
      `http://localhost/api/portfolios/${portfolioId}/holdings`,
      { headers: authHeaders() },
    );
    const holdingsBeforeBody = (await holdingsBefore.json()) as { data: unknown[] };
    expect(holdingsBeforeBody.data).toHaveLength(1);

    const res = await deleteTransaction(tx.id);
    expect(res.status).toBe(200);

    // Verify holding removed
    const holdingsAfter = await worker.fetch(
      `http://localhost/api/portfolios/${portfolioId}/holdings`,
      { headers: authHeaders() },
    );
    const holdingsAfterBody = (await holdingsAfter.json()) as { data: unknown[] };
    expect(holdingsAfterBody.data).toHaveLength(0);

    const txAfter = await db
      .prepare("SELECT id FROM transactions WHERE id = ?")
      .bind(tx.id)
      .first();
    expect(txAfter).toBeNull();
  });

  it("[UC-PORTFOLIO-004-S03] deleting a sell restores lot quantities", async () => {
    await makeBuy("AAPL", 100, 150, "2024-01-15", 5);

    const sellRes = await worker.fetch(
      `http://localhost/api/portfolios/${portfolioId}/transactions`,
      {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: "AAPL",
          type: "sell",
          quantity: 50,
          price: 170,
          fee: 5,
          date: "2024-02-01",
        }),
      },
    );
    const { data: sellTx } = (await sellRes.json()) as { data: { id: number } };

    // Verify holding quantity after sell
    const holdingsBefore = await worker.fetch(
      `http://localhost/api/portfolios/${portfolioId}/holdings`,
      { headers: authHeaders() },
    );
    const holdingsBeforeBody = (await holdingsBefore.json()) as {
      data: Array<{ quantity: number }>;
    };
    expect(holdingsBeforeBody.data[0].quantity).toBe(50);

    const res = await deleteTransaction(sellTx.id);
    expect(res.status).toBe(200);

    // Verify holding quantity restored after delete
    const holdingsAfter = await worker.fetch(
      `http://localhost/api/portfolios/${portfolioId}/holdings`,
      { headers: authHeaders() },
    );
    const holdingsAfterBody = (await holdingsAfter.json()) as {
      data: Array<{ quantity: number }>;
    };
    expect(holdingsAfterBody.data[0].quantity).toBe(100);
  });

  it("[UC-PORTFOLIO-004-S04] returns empty array when no transactions", async () => {
    const body = await getTransactions();
    expect(body.data).toHaveLength(0);
  });

  it("[UC-PORTFOLIO-004-S08] returns stock name from stocks table", async () => {
    await makeBuy("AAPL", 100, 150, "2024-01-15");
    await db
      .prepare("INSERT INTO stocks (symbol, name) VALUES (?, ?)")
      .bind("AAPL", "Apple Inc")
      .run();

    const res = await worker.fetch(`http://localhost/api/portfolios/${portfolioId}/transactions`, {
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Array<{ symbol: string; name: string }> };
    expect(body.data[0].name).toBe("Apple Inc");
  });

  it("[UC-PORTFOLIO-004-S09] falls back to symbol when stocks table has no name", async () => {
    await makeBuy("AAPL", 100, 150, "2024-01-15");

    const res = await worker.fetch(`http://localhost/api/portfolios/${portfolioId}/transactions`, {
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Array<{ symbol: string; name: string }> };
    expect(body.data[0].name).toBe("AAPL");
  });

  it("[UC-PORTFOLIO-004-S10] filters by date range with startDate and endDate", async () => {
    await makeBuy("AAPL", 10, 150, "2024-01-15");
    await makeBuy("TSLA", 5, 200, "2024-03-01");
    await makeBuy("NVDA", 8, 100, "2024-06-20");

    const body = await getTransactionsWithParams("?startDate=2024-02-01&endDate=2024-05-01");
    expect(body.data).toHaveLength(1);
    expect(body.data[0].symbol).toBe("TSLA");
  });

  it("[UC-PORTFOLIO-004-S11] filters with startDate only", async () => {
    await makeBuy("AAPL", 10, 150, "2024-01-15");
    await makeBuy("TSLA", 5, 200, "2024-03-01");
    await makeBuy("NVDA", 8, 100, "2024-06-20");

    const body = await getTransactionsWithParams("?startDate=2024-03-01");
    expect(body.data).toHaveLength(2);
    expect(body.data[0].date).toBe("2024-06-20");
    expect(body.data[1].date).toBe("2024-03-01");
  });

  it("[UC-PORTFOLIO-004-S12] filters with endDate only", async () => {
    await makeBuy("AAPL", 10, 150, "2024-01-15");
    await makeBuy("TSLA", 5, 200, "2024-03-01");
    await makeBuy("NVDA", 8, 100, "2024-06-20");

    const body = await getTransactionsWithParams("?endDate=2024-02-01");
    expect(body.data).toHaveLength(1);
    expect(body.data[0].date).toBe("2024-01-15");
  });

  it("GET /symbols returns distinct symbols for a portfolio", async () => {
    await makeBuy("AAPL", 10, 150, "2024-01-15");
    await makeBuy("TSLA", 5, 200, "2024-02-01");
    await makeBuy("AAPL", 20, 160, "2024-03-01");

    const res = await worker.fetch(
      `http://localhost/api/portfolios/${portfolioId}/transactions/symbols`,
      { headers: authHeaders() },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: string[] };
    expect(body.data).toEqual(["AAPL", "TSLA"]);
  });

  it("GET /symbols returns empty array when no transactions", async () => {
    const res = await worker.fetch(
      `http://localhost/api/portfolios/${portfolioId}/transactions/symbols`,
      { headers: authHeaders() },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: string[] };
    expect(body.data).toEqual([]);
  });
});
