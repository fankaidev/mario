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
  worker = await unstable_dev("src/index.ts", { config: "wrangler.toml", local: true });
});

afterAll(async () => await worker.stop());

beforeEach(async () => {
  await cleanDatabase(db);
  const userResult = await db
    .prepare("INSERT INTO users (email) VALUES (?) RETURNING id")
    .bind("test@example.com")
    .first<{ id: number }>();
  authToken = await createApiTokenForUser(db, userResult!.id);
  const portfolioResult = await db
    .prepare("INSERT INTO portfolios (user_id, name, currency) VALUES (?, ?, ?) RETURNING id")
    .bind(userResult!.id, "US Stocks", "USD")
    .first<{ id: number }>();
  portfolioId = portfolioResult!.id;
});

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${authToken}` };
}

async function makeBuy(symbol: string, quantity: number, price: number, fee: number, date: string) {
  const res = await worker.fetch(`http://localhost/api/portfolios/${portfolioId}/transactions`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ symbol, type: "buy", quantity, price, fee, date }),
  });
  return (await res.json()) as { data: { id: number } };
}

async function makeSell(
  symbol: string,
  quantity: number,
  price: number,
  fee: number,
  date: string,
) {
  const res = await worker.fetch(`http://localhost/api/portfolios/${portfolioId}/transactions`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ symbol, type: "sell", quantity, price, fee, date }),
  });
  return (await res.json()) as { data: { id: number } };
}

async function createCorporateAction(
  symbol: string,
  type: string,
  ratio: number,
  effectiveDate: string,
) {
  const res = await worker.fetch(
    `http://localhost/api/portfolios/${portfolioId}/corporate-actions`,
    {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ symbol, type, ratio, effective_date: effectiveDate }),
    },
  );
  return res;
}

async function getHoldings() {
  const res = await worker.fetch(`http://localhost/api/portfolios/${portfolioId}/holdings`, {
    headers: authHeaders(),
  });
  return (await res.json()) as { data: Array<{ symbol: string; quantity: number; cost: number }> };
}

async function getLotDetails(symbol: string) {
  const res = await worker.fetch(
    `http://localhost/api/portfolios/${portfolioId}/holdings/${symbol}/lots`,
    { headers: authHeaders() },
  );
  return (await res.json()) as {
    data: {
      symbol: string;
      total_quantity: number;
      lots: Array<{ quantity: number; remaining_quantity: number; cost_basis: number }>;
    };
  };
}

describe("Corporate Actions", () => {
  it("[UC-PORTFOLIO-010-S01] processes stock split updating lot quantities", async () => {
    // Buy 100 shares of AAPL at $150 + $5 fee on 2024-01-01
    await makeBuy("AAPL", 100, 150, 5, "2024-01-01");

    // Apply 4:1 stock split on 2024-06-01
    const res = await createCorporateAction("AAPL", "split", 4, "2024-06-01");
    expect(res.status).toBe(201);

    // Verify holdings reflect the split
    const holdings = await getHoldings();
    expect(holdings.data).toHaveLength(1);
    expect(holdings.data[0]!.symbol).toBe("AAPL");
    expect(holdings.data[0]!.quantity).toBe(400); // 100 * 4 = 400

    // Verify lot details
    const lotDetails = await getLotDetails("AAPL");
    expect(lotDetails.data.total_quantity).toBe(400);
    expect(lotDetails.data.lots).toHaveLength(1);
    expect(lotDetails.data.lots[0]!.quantity).toBe(400);
    expect(lotDetails.data.lots[0]!.remaining_quantity).toBe(400);
    // Cost basis should remain unchanged (15005 = 100 * 150 + 5)
    expect(lotDetails.data.lots[0]!.cost_basis).toBe(15005);
  });

  it("[UC-PORTFOLIO-010-S02] only affects open lots", async () => {
    // Buy 100 shares of AAPL on 2024-01-01
    await makeBuy("AAPL", 100, 150, 5, "2024-01-01");

    // Sell all 100 shares on 2024-02-01
    await makeSell("AAPL", 100, 160, 5, "2024-02-01");

    // Apply 4:1 stock split on 2024-06-01
    const res = await createCorporateAction("AAPL", "split", 4, "2024-06-01");
    expect(res.status).toBe(201);

    // Holdings should be empty (all sold before split)
    const holdings = await getHoldings();
    expect(holdings.data).toHaveLength(0);

    // Lot details should show the closed lot unchanged
    const lotDetails = await getLotDetails("AAPL");
    expect(lotDetails.data.total_quantity).toBe(0);
    expect(lotDetails.data.lots).toHaveLength(1);
    // Original quantity remains 100 (not multiplied by 4 because lot was closed before split)
    expect(lotDetails.data.lots[0]!.quantity).toBe(100);
    expect(lotDetails.data.lots[0]!.remaining_quantity).toBe(0);
  });

  it("[UC-PORTFOLIO-010-S03] same-day split processed after transactions", async () => {
    // Buy 100 shares of AAPL on 2024-06-01 (same day as split)
    await makeBuy("AAPL", 100, 150, 0, "2024-06-01");

    // Apply 4:1 stock split on 2024-06-01 (same day)
    const res = await createCorporateAction("AAPL", "split", 4, "2024-06-01");
    expect(res.status).toBe(201);

    // Since corporate actions are processed AFTER same-day transactions,
    // the buy should happen first, then the split
    const holdings = await getHoldings();
    expect(holdings.data[0]!.quantity).toBe(400); // 100 * 4 = 400
  });

  it("[UC-PORTFOLIO-010-S04] reverse split (merge) divides quantities", async () => {
    // Buy 400 shares of AAPL on 2024-01-01
    await makeBuy("AAPL", 400, 50, 0, "2024-01-01");

    // Apply 1:4 reverse split (merge ratio 4 means divide by 4)
    const res = await createCorporateAction("AAPL", "merge", 4, "2024-06-01");
    expect(res.status).toBe(201);

    const holdings = await getHoldings();
    expect(holdings.data[0]!.quantity).toBe(100); // 400 / 4 = 100

    const lotDetails = await getLotDetails("AAPL");
    expect(lotDetails.data.lots[0]!.cost_basis).toBe(20000); // Cost basis unchanged
  });
});
