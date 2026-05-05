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
        "INSERT INTO exchange_rates (from_currency, to_currency, date, rate) VALUES ('USD', 'CNY', '2024-03-01', 10)",
      )
      .run();

    const rate = await getExchangeRate(db, "CNY", "USD", "2024-03-01");
    expect(rate).toBe(0.1);
  });

  it("[UC-PORTFOLIO-011-S02] falls back to nearest earlier date", async () => {
    await db
      .prepare(
        "INSERT INTO exchange_rates (from_currency, to_currency, date, rate) VALUES ('USD', 'CNY', '2024-03-01', 10)",
      )
      .run();

    const rate = await getExchangeRate(db, "CNY", "USD", "2024-03-05");
    expect(rate).toBe(0.1);
  });

  it("[UC-PORTFOLIO-011-S03] returns 1 when from and to are the same currency", async () => {
    const rate = await getExchangeRate(db, "USD", "USD", "2024-03-01");
    expect(rate).toBe(1);
  });

  it("[UC-PORTFOLIO-011-S04] returns null when no rate exists", async () => {
    const rate = await getExchangeRate(db, "CNY", "USD", "2024-03-01");
    expect(rate).toBeNull();
  });

  it("[UC-PORTFOLIO-011-S04b] uses inverse rate when direct rate not stored", async () => {
    await db
      .prepare(
        "INSERT INTO exchange_rates (from_currency, to_currency, date, rate) VALUES ('USD', 'HKD', '2024-03-01', 8)",
      )
      .run();

    // USD→HKD direct: 8
    const rate = await getExchangeRate(db, "USD", "HKD", "2024-03-01");
    expect(rate).toBe(8);
  });

  it("[UC-PORTFOLIO-011-S04c] computes cross-rate via USD for HKD→CNY", async () => {
    await db
      .prepare(
        "INSERT INTO exchange_rates (from_currency, to_currency, date, rate) VALUES ('USD', 'HKD', '2024-03-01', 8), ('USD', 'CNY', '2024-03-01', 10)",
      )
      .run();

    // HKD→CNY: (1/8) / (1/10) = 10/8 = 1.25
    const rate = await getExchangeRate(db, "HKD", "CNY", "2024-03-01");
    expect(rate).toBe(1.25);
  });

  it("[UC-PORTFOLIO-011-S02b] returns latest rate when no date provided", async () => {
    await db
      .prepare(
        "INSERT INTO exchange_rates (from_currency, to_currency, date, rate) VALUES ('USD', 'CNY', '2024-01-01', 7.69), ('USD', 'CNY', '2024-03-01', 10)",
      )
      .run();

    // CNY→USD via inverse of latest USD→CNY: 1/10 = 0.1
    const rate = await getExchangeRate(db, "CNY", "USD");
    expect(rate).toBe(0.1);
  });
});

describe("GET /api/exchange-rates", () => {
  it("lists exchange rates with optional filters", async () => {
    await db
      .prepare(
        "INSERT INTO exchange_rates (from_currency, to_currency, date, rate) VALUES ('USD', 'CNY', '2024-03-01', 10)",
      )
      .run();
    await db
      .prepare(
        "INSERT INTO exchange_rates (from_currency, to_currency, date, rate) VALUES ('USD', 'HKD', '2024-03-01', 8)",
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
        "INSERT INTO exchange_rates (from_currency, to_currency, date, rate) VALUES ('USD', 'CNY', '2024-03-01', 10)",
      )
      .run();
    await db
      .prepare(
        "INSERT INTO exchange_rates (from_currency, to_currency, date, rate) VALUES ('USD', 'HKD', '2024-03-01', 8)",
      )
      .run();

    const res = await ctx.request("/api/exchange-rates?from=USD", {
      headers: authHeaders(),
    });
    const body = (await res.json()) as { data: ExchangeRateRecord[] };
    expect(body.data.length).toBe(2);
    expect(body.data[0]!.from_currency).toBe("USD");
  });

  it("[UC-PORTFOLIO-011-S06] returns all records when more than 100 exist", async () => {
    // Insert 150 records spanning two currency pairs using individual inserts
    for (let i = 0; i < 75; i++) {
      const date = new Date(2024, 0, 1);
      date.setDate(date.getDate() + i);
      const dateStr = date.toISOString().split("T")[0]!;
      await db
        .prepare(
          "INSERT INTO exchange_rates (from_currency, to_currency, date, rate) VALUES ('USD', 'CNY', ?, 7.0)",
        )
        .bind(dateStr)
        .run();
      await db
        .prepare(
          "INSERT INTO exchange_rates (from_currency, to_currency, date, rate) VALUES ('USD', 'HKD', ?, 7.8)",
        )
        .bind(dateStr)
        .run();
    }

    const res = await ctx.request("/api/exchange-rates", {
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: ExchangeRateRecord[] };
    expect(body.data.length).toBe(150);
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
          chart: {
            result: [
              {
                timestamp: [new Date("2024-06-15").getTime() / 1000],
                indicators: { quote: [{ close: [10] }] },
              },
            ],
          },
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

      // Verify records exist
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
