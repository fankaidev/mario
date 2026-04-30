import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPlatformProxy, unstable_dev } from "wrangler";
import type { UnstableDevWorker } from "wrangler";
import { cleanDatabase } from "./helpers";

let worker: UnstableDevWorker;
let db: D1Database;
let portfolioId: number;

beforeAll(async () => {
  const { env } = await getPlatformProxy<{ DB: D1Database }>();
  db = env.DB;
  worker = await unstable_dev("src/index.ts", { config: "wrangler.toml", local: true });
});

afterAll(async () => await worker.stop());

beforeEach(async () => {
  await cleanDatabase(db);
  const userResult = await db
    .prepare("INSERT INTO users (email) VALUES (?) RETURNING id")
    .bind("test@example.com")
    .first<{ id: number }>();
  const portfolioResult = await db
    .prepare("INSERT INTO portfolios (user_id, name, currency) VALUES (?, ?, ?) RETURNING id")
    .bind(userResult!.id, "US Stocks", "USD")
    .first<{ id: number }>();
  portfolioId = portfolioResult!.id;
});

function authHeaders(): Record<string, string> {
  return { "CF-Access-Authenticated-User-Email": "test@example.com" };
}

function tagUrl(path = "") {
  return `http://localhost/api/portfolios/${portfolioId}/tags${path}`;
}

async function createTag(name: string) {
  const res = await worker.fetch(tagUrl(), {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  return (await res.json()) as { data: { id: number; name: string } };
}

describe("Stock Tags", () => {
  it("[UC-PORTFOLIO-007-S01] creates tag successfully", async () => {
    const { data } = await createTag("High Dividend");
    expect(data.name).toBe("High Dividend");

    const { data: list } = (await worker
      .fetch(tagUrl(), { headers: authHeaders() })
      .then((r) => r.json())) as { data: Array<{ name: string }> };
    expect(list.some((t) => t.name === "High Dividend")).toBe(true);
  });

  it("[UC-PORTFOLIO-007-S02] tags a stock with a tag", async () => {
    const { data: tag } = await createTag("High Dividend");

    await worker.fetch(tagUrl(`/${tag.id}/stocks`), {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ symbol: "AAPL" }),
    });

    const row = await db
      .prepare("SELECT * FROM stock_tags WHERE portfolio_id = ? AND symbol = ? AND tag_id = ?")
      .bind(portfolioId, "AAPL", tag.id)
      .first();
    expect(row).not.toBeNull();
  });

  it("[UC-PORTFOLIO-007-S03] stock can have multiple tags", async () => {
    const { data: tag1 } = await createTag("High Dividend");
    const { data: tag2 } = await createTag("Tech");

    await worker.fetch(tagUrl(`/${tag1.id}/stocks`), {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ symbol: "AAPL" }),
    });
    await worker.fetch(tagUrl(`/${tag2.id}/stocks`), {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ symbol: "AAPL" }),
    });

    const rows = await db.prepare("SELECT * FROM stock_tags WHERE symbol = ?").bind("AAPL").all();
    expect(rows.results).toHaveLength(2);
  });

  it("[UC-PORTFOLIO-007-S05] deleting tag cascades stock associations", async () => {
    const { data: tag } = await createTag("High Dividend");

    await worker.fetch(tagUrl(`/${tag.id}/stocks`), {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ symbol: "AAPL" }),
    });

    await worker.fetch(tagUrl(`/${tag.id}`), { method: "DELETE", headers: authHeaders() });

    const stockTags = await db
      .prepare("SELECT * FROM stock_tags WHERE tag_id = ?")
      .bind(tag.id)
      .all();
    expect(stockTags.results).toHaveLength(0);

    const tagRow = await db.prepare("SELECT * FROM tags WHERE id = ?").bind(tag.id).first();
    expect(tagRow).toBeNull();
  });
});
