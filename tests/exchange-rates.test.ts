import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestContext, cleanDatabase, createApiTokenForUser } from "./helpers";
import type { TestContext } from "./helpers";
import { getExchangeRate } from "../src/lib/currency";
import type { ExchangeRateRecord } from "../shared/types/api";

let ctx: TestContext;
let db: D1Database;
let authToken: string;

beforeAll(async () => {
  ctx = await createTestContext();
  db = ctx.db;
});

afterAll(async () => {
  await ctx.clean();
});

beforeEach(async () => {
  await cleanDatabase(db);
  const userResult = await db
    .prepare("INSERT INTO users (email) VALUES (?) RETURNING id")
    .bind("test@example.com")
    .first<{ id: number }>();
  authToken = await createApiTokenForUser(db, userResult!.id);
});

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${authToken}` };
}

describe("getExchangeRate", () => {
  it("[UC-PORTFOLIO-011-S01] returns exact date match", async () => {
    await db
      .prepare(
        "INSERT INTO exchange_rates (from_currency, to_currency, date, rate) VALUES ('CNY', 'USD', '2024-03-01', 0.14)",
      )
      .run();

    const rate = await getExchangeRate(db, "CNY", "USD", "2024-03-01");
    expect(rate).toBe(0.14);
  });

  it("[UC-PORTFOLIO-011-S02] falls back to nearest earlier date", async () => {
    await db
      .prepare(
        "INSERT INTO exchange_rates (from_currency, to_currency, date, rate) VALUES ('CNY', 'USD', '2024-03-01', 0.14)",
      )
      .run();

    const rate = await getExchangeRate(db, "CNY", "USD", "2024-03-05");
    expect(rate).toBe(0.14);
  });

  it("[UC-PORTFOLIO-011-S03] returns 1 when from and to are the same currency", async () => {
    const rate = await getExchangeRate(db, "USD", "USD", "2024-03-01");
    expect(rate).toBe(1);
  });

  it("[UC-PORTFOLIO-011-S04] returns null when no rate exists", async () => {
    const rate = await getExchangeRate(db, "CNY", "USD", "2024-03-01");
    expect(rate).toBeNull();
  });

  it("[UC-PORTFOLIO-011-S02b] returns latest rate when no date provided", async () => {
    await db
      .prepare(
        "INSERT INTO exchange_rates (from_currency, to_currency, date, rate) VALUES ('CNY', 'USD', '2024-01-01', 0.13)",
      )
      .run();
    await db
      .prepare(
        "INSERT INTO exchange_rates (from_currency, to_currency, date, rate) VALUES ('CNY', 'USD', '2024-03-01', 0.14)",
      )
      .run();

    const rate = await getExchangeRate(db, "CNY", "USD");
    expect(rate).toBe(0.14);
  });
});

describe("GET /api/exchange-rates", () => {
  it("lists exchange rates with optional filters", async () => {
    await db
      .prepare(
        "INSERT INTO exchange_rates (from_currency, to_currency, date, rate) VALUES ('CNY', 'USD', '2024-03-01', 0.14)",
      )
      .run();
    await db
      .prepare(
        "INSERT INTO exchange_rates (from_currency, to_currency, date, rate) VALUES ('HKD', 'USD', '2024-03-01', 0.128)",
      )
      .run();

    const res = await ctx.request("/api/exchange-rates", {
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: ExchangeRateRecord[] };
    expect(body.data.length).toBe(2);
  });

  it("filters by from_currency", async () => {
    await db
      .prepare(
        "INSERT INTO exchange_rates (from_currency, to_currency, date, rate) VALUES ('CNY', 'USD', '2024-03-01', 0.14)",
      )
      .run();
    await db
      .prepare(
        "INSERT INTO exchange_rates (from_currency, to_currency, date, rate) VALUES ('HKD', 'USD', '2024-03-01', 0.128)",
      )
      .run();

    const res = await ctx.request("/api/exchange-rates?from=CNY", {
      headers: authHeaders(),
    });
    const body = (await res.json()) as { data: ExchangeRateRecord[] };
    expect(body.data.length).toBe(1);
    expect(body.data[0]!.from_currency).toBe("CNY");
  });

  it("requires authentication", async () => {
    const res = await ctx.request("/api/exchange-rates");
    expect(res.status).toBe(401);
  });
});

describe("POST /api/exchange-rates/sync", () => {
  it("[UC-PORTFOLIO-011-S05] syncs rates and is idempotent via HTTP", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          amount: 1,
          base: "CNY",
          date: "2024-06-15",
          rates: { USD: 0.14 },
        }),
    });
    vi.stubGlobal("fetch", mockFetch);

    try {
      // First sync should insert records
      const res1 = await ctx.request("/api/exchange-rates/sync", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
      });
      expect(res1.status).toBe(200);
      const body1 = (await res1.json()) as {
        data: { records_synced: number };
      };
      expect(body1.data.records_synced).toBeGreaterThanOrEqual(1);

      // Verify records exist in the list endpoint
      const listRes = await ctx.request("/api/exchange-rates", {
        headers: authHeaders(),
      });
      const listBody = (await listRes.json()) as { data: ExchangeRateRecord[] };
      expect(listBody.data.length).toBeGreaterThanOrEqual(1);

      // Second sync should be idempotent
      const res2 = await ctx.request("/api/exchange-rates/sync", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
      });
      const body2 = (await res2.json()) as {
        data: { records_synced: number };
      };
      expect(body2.data.records_synced).toBe(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("requires authentication", async () => {
    const res = await ctx.request("/api/exchange-rates/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(401);
  });
});
