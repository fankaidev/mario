import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { getPlatformProxy } from "wrangler";

export interface TestContext {
  db: D1Database;
  persistTo: string;
  cleanup: () => void;
}

export async function createTestContext(): Promise<TestContext> {
  const persistTo = mkdtempSync(join(tmpdir(), "mario-test-"));
  const { env } = await getPlatformProxy<{ DB: D1Database }>({
    persist: { path: join(persistTo, "v3") },
  });
  const db = env.DB;
  await ensureMigrations(db);
  return {
    db,
    persistTo,
    cleanup: () => rmSync(persistTo, { recursive: true, force: true }),
  };
}

export async function ensureMigrations(db: D1Database) {
  // Check if migrations already applied by looking for a known table
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
        // Skip statements that fail on re-run (ALTER/DROP already applied, etc.)
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
  ]) {
    try {
      await db.exec(`DELETE FROM ${table}`);
    } catch {
      // Table may not exist (e.g., dropped by migration)
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
