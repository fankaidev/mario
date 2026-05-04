import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { unstable_dev } from "wrangler";
import type { UnstableDevWorker } from "wrangler";
import type { TestContext } from "./helpers";
import { cleanDatabase, createApiTokenForUser, createTestContext } from "./helpers";

let worker: UnstableDevWorker;
let db: D1Database;
let ctx: TestContext;
let userId: number;
let authToken: string;

beforeAll(async () => {
  ctx = await createTestContext();
  db = ctx.db;
  worker = await unstable_dev("src/index.ts", {
    config: "wrangler.toml",
    local: true,
    persistTo: ctx.persistTo,
  });
});

afterAll(async () => {
  await worker.stop();
  ctx.cleanup();
});

beforeEach(async () => {
  await cleanDatabase(db);
  const result = await db
    .prepare("INSERT INTO users (email) VALUES (?) RETURNING id")
    .bind("test@example.com")
    .first<{ id: number }>();
  userId = result!.id;
  authToken = await createApiTokenForUser(db, userId);
});

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${authToken}` };
}

describe("Portfolio CRUD", () => {
  it("[UC-PORTFOLIO-001-S01] creates portfolio and returns it", async () => {
    const res = await worker.fetch("http://localhost/api/portfolios", {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "US Stocks", currency: "USD" }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      data: { id: number; name: string; currency: string; archived: number };
    };
    expect(body.data.name).toBe("US Stocks");
    expect(body.data.currency).toBe("USD");
    expect(body.data.archived).toBe(0);

    const row = await db
      .prepare("SELECT id FROM portfolios WHERE name = ? AND user_id = ?")
      .bind("US Stocks", userId)
      .first();
    expect(row).not.toBeNull();
  });

  it("[UC-PORTFOLIO-001-S02] returns 409 for duplicate name", async () => {
    await worker.fetch("http://localhost/api/portfolios", {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "HK Stocks", currency: "HKD" }),
    });

    const res = await worker.fetch("http://localhost/api/portfolios", {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "HK Stocks", currency: "HKD" }),
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("already exists");
  });

  it("[UC-PORTFOLIO-001-S03] lists all user portfolios", async () => {
    await worker.fetch("http://localhost/api/portfolios", {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "US Stocks", currency: "USD" }),
    });
    await worker.fetch("http://localhost/api/portfolios", {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "HK Stocks", currency: "HKD" }),
    });

    const res = await worker.fetch("http://localhost/api/portfolios", {
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Array<{ name: string; currency: string }> };
    expect(body.data).toHaveLength(2);
    expect(body.data.map((p) => p.name)).toEqual(
      expect.arrayContaining(["US Stocks", "HK Stocks"]),
    );
  });

  it("[UC-PORTFOLIO-001-S04] returns 401 when unauthenticated", async () => {
    const res = await worker.fetch("http://localhost/api/portfolios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "US Stocks", currency: "USD" }),
    });
    expect(res.status).toBe(401);
  });

  it("[UC-PORTFOLIO-001-S05] soft deletes portfolio and hides from list", async () => {
    const createRes = await worker.fetch("http://localhost/api/portfolios", {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "US Stocks", currency: "USD" }),
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { data: { id: number } };
    const portfolioId = created.data.id;

    const deleteRes = await worker.fetch(`http://localhost/api/portfolios/${portfolioId}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    expect(deleteRes.status).toBe(200);
    const deleteBody = (await deleteRes.json()) as { data: { message: string } };
    expect(deleteBody.data.message).toBe("Portfolio deleted");

    const listRes = await worker.fetch("http://localhost/api/portfolios", {
      headers: authHeaders(),
    });
    expect(listRes.status).toBe(200);
    const listBody = (await listRes.json()) as { data: Array<{ id: number }> };
    expect(listBody.data).toHaveLength(0);
  });

  it("[UC-PORTFOLIO-001-S06] deleted portfolio returns 404 on GET by id", async () => {
    const createRes = await worker.fetch("http://localhost/api/portfolios", {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "US Stocks", currency: "USD" }),
    });
    const created = (await createRes.json()) as { data: { id: number } };
    const portfolioId = created.data.id;

    await worker.fetch(`http://localhost/api/portfolios/${portfolioId}`, {
      method: "DELETE",
      headers: authHeaders(),
    });

    const getRes = await worker.fetch(`http://localhost/api/portfolios/${portfolioId}`, {
      headers: authHeaders(),
    });
    expect(getRes.status).toBe(404);
  });

  it("[UC-PORTFOLIO-001-S07] restores deleted portfolio", async () => {
    const createRes = await worker.fetch("http://localhost/api/portfolios", {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "US Stocks", currency: "USD" }),
    });
    const created = (await createRes.json()) as { data: { id: number; name: string } };
    const portfolioId = created.data.id;

    await worker.fetch(`http://localhost/api/portfolios/${portfolioId}`, {
      method: "DELETE",
      headers: authHeaders(),
    });

    const restoreRes = await worker.fetch(
      `http://localhost/api/portfolios/${portfolioId}/restore`,
      {
        method: "POST",
        headers: authHeaders(),
      },
    );
    expect(restoreRes.status).toBe(200);
    const restored = (await restoreRes.json()) as { data: { id: number; name: string } };
    expect(restored.data.id).toBe(portfolioId);
    expect(restored.data.name).toBe("US Stocks");

    const listRes = await worker.fetch("http://localhost/api/portfolios", {
      headers: authHeaders(),
    });
    const listBody = (await listRes.json()) as { data: Array<{ id: number }> };
    expect(listBody.data).toHaveLength(1);
    expect(listBody.data[0].id).toBe(portfolioId);
  });

  it("[UC-PORTFOLIO-001-S08] non-owner cannot delete portfolio", async () => {
    const createRes = await worker.fetch("http://localhost/api/portfolios", {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "US Stocks", currency: "USD" }),
    });
    const created = (await createRes.json()) as { data: { id: number } };
    const portfolioId = created.data.id;

    const otherUser = await db
      .prepare("INSERT INTO users (email) VALUES (?) RETURNING id")
      .bind("other@example.com")
      .first<{ id: number }>();
    const otherToken = await createApiTokenForUser(db, otherUser!.id);

    const deleteRes = await worker.fetch(`http://localhost/api/portfolios/${portfolioId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${otherToken}` },
    });
    expect(deleteRes.status).toBe(404);
  });

  it("[UC-PORTFOLIO-001-S09] unauthenticated delete returns 401", async () => {
    const deleteRes = await worker.fetch("http://localhost/api/portfolios/1", {
      method: "DELETE",
    });
    expect(deleteRes.status).toBe(401);
  });

  it("deleted portfolio returns 404 for holdings endpoint", async () => {
    const createRes = await worker.fetch("http://localhost/api/portfolios", {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "US Stocks", currency: "USD" }),
    });
    const created = (await createRes.json()) as { data: { id: number } };
    const portfolioId = created.data.id;

    await worker.fetch(`http://localhost/api/portfolios/${portfolioId}`, {
      method: "DELETE",
      headers: authHeaders(),
    });

    const res = await worker.fetch(`http://localhost/api/portfolios/${portfolioId}/holdings`, {
      headers: authHeaders(),
    });
    expect(res.status).toBe(404);
  });

  it("deleted portfolio returns 404 for summary endpoint", async () => {
    const createRes = await worker.fetch("http://localhost/api/portfolios", {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "US Stocks", currency: "USD" }),
    });
    const created = (await createRes.json()) as { data: { id: number } };
    const portfolioId = created.data.id;

    await worker.fetch(`http://localhost/api/portfolios/${portfolioId}`, {
      method: "DELETE",
      headers: authHeaders(),
    });

    const res = await worker.fetch(`http://localhost/api/portfolios/${portfolioId}/summary`, {
      headers: authHeaders(),
    });
    expect(res.status).toBe(404);
  });

  it("restoring non-deleted portfolio returns 404", async () => {
    const createRes = await worker.fetch("http://localhost/api/portfolios", {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "US Stocks", currency: "USD" }),
    });
    const created = (await createRes.json()) as { data: { id: number } };
    const portfolioId = created.data.id;

    const restoreRes = await worker.fetch(
      `http://localhost/api/portfolios/${portfolioId}/restore`,
      {
        method: "POST",
        headers: authHeaders(),
      },
    );
    expect(restoreRes.status).toBe(404);
  });

  it("deleting already deleted portfolio returns 404", async () => {
    const createRes = await worker.fetch("http://localhost/api/portfolios", {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "US Stocks", currency: "USD" }),
    });
    const created = (await createRes.json()) as { data: { id: number } };
    const portfolioId = created.data.id;

    await worker.fetch(`http://localhost/api/portfolios/${portfolioId}`, {
      method: "DELETE",
      headers: authHeaders(),
    });

    const deleteRes2 = await worker.fetch(`http://localhost/api/portfolios/${portfolioId}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    expect(deleteRes2.status).toBe(404);
  });

  it("include_deleted returns deleted portfolios", async () => {
    const createRes = await worker.fetch("http://localhost/api/portfolios", {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "US Stocks", currency: "USD" }),
    });
    const created = (await createRes.json()) as { data: { id: number } };
    const portfolioId = created.data.id;

    await worker.fetch(`http://localhost/api/portfolios/${portfolioId}`, {
      method: "DELETE",
      headers: authHeaders(),
    });

    const listRes = await worker.fetch("http://localhost/api/portfolios?include_deleted=true", {
      headers: authHeaders(),
    });
    expect(listRes.status).toBe(200);
    const body = (await listRes.json()) as {
      data: Array<{ id: number; deleted_at: string | null }>;
    };
    const deleted = body.data.find((p) => p.id === portfolioId);
    expect(deleted).toBeDefined();
    expect(deleted!.deleted_at).not.toBeNull();
  });
});
