import Database from "better-sqlite3";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { app } from "../src/index";
import { createD1Adapter } from "./d1-adapter";
import type { Bindings } from "../src/types";

export interface TestContext {
  db: D1Database;
  /** Call app.request() with the DB binding injected */
  request: (path: string, init?: RequestInit) => Promise<Response>;
  /** Delete all rows from all tables and close the database */
  clean: () => Promise<void>;
}

export async function createTestContext(envVars?: Partial<Bindings>): Promise<TestContext> {
  const sqlite = new Database(":memory:");
  const db = createD1Adapter(sqlite) as unknown as D1Database;
  await ensureMigrations(db as unknown as D1Database);

  const env: Bindings = { DB: db, ...envVars };

  const tables = [
    "stock_tags",
    "corporate_actions",
    "realized_pnl",
    "lots",
    "transactions",
    "transfers",
    "portfolio_snapshots",
    "price_history",
    "stocks",
    "tags",
    "api_tokens",
    "portfolios",
    "users",
    "exchange_rates",
  ];

  return {
    db,
    request: (path, init) => app.request(path, init, env),
    clean: async () => {
      for (const table of tables) {
        try {
          await db.exec(`DELETE FROM ${table}`);
        } catch {
          // Table may not exist
        }
      }
      sqlite.close();
    },
  };
}

export async function ensureMigrations(db: D1Database) {
  try {
    const result = await db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
      .first();
    if (result) return;
  } catch {
    // sqlite_master may not exist yet
  }

  const migrationsDir = join(import.meta.dirname, "..", "migrations");
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const raw = readFileSync(join(migrationsDir, file), "utf-8");
    const sql = raw
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
    for (const stmt of sql.split(";")) {
      let collapsed = stmt.replace(/\s+/g, " ").trim();
      if (!collapsed) continue;
      collapsed = collapsed.replace(/^CREATE TABLE /, "CREATE TABLE IF NOT EXISTS ");
      try {
        await db.exec(collapsed);
      } catch {
        // Skip statements that fail on re-run
      }
    }
  }
}

export async function cleanDatabase(db: D1Database) {
  for (const table of [
    "stock_tags",
    "corporate_actions",
    "realized_pnl",
    "lots",
    "transactions",
    "transfers",
    "portfolio_snapshots",
    "price_history",
    "stocks",
    "tags",
    "api_tokens",
    "portfolios",
    "users",
    "exchange_rates",
  ]) {
    try {
      await db.exec(`DELETE FROM ${table}`);
    } catch {
      // Table may not exist
    }
  }
}

export async function createApiTokenForUser(
  db: D1Database,
  userId: number,
  name = "Test Token",
): Promise<string> {
  const rawToken = crypto.randomUUID();
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(rawToken));
  const tokenHash = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  await db
    .prepare("INSERT INTO api_tokens (user_id, name, token_hash) VALUES (?, ?, ?)")
    .bind(userId, name, tokenHash)
    .run();

  return rawToken;
}
