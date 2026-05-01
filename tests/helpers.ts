export async function cleanDatabase(db: D1Database) {
  await db.exec("CREATE TABLE IF NOT EXISTS stocks (symbol TEXT PRIMARY KEY, name TEXT NOT NULL)");
  try {
    await db.exec("ALTER TABLE portfolios ADD COLUMN cash_balance REAL NOT NULL DEFAULT 0");
  } catch {
    // column may already exist
  }

  // Apply 0007 migration schema changes for tests
  try {
    const schema = await db
      .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='transactions'")
      .first<{ sql: string }>();
    if (schema && schema.sql.includes("symbol TEXT NOT NULL")) {
      await db.exec("PRAGMA foreign_keys = OFF");
      await db.exec("CREATE TABLE transactions_new AS SELECT * FROM transactions");
      await db.exec("DROP TABLE transactions");
      await db.exec(
        "CREATE TABLE transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, portfolio_id INTEGER NOT NULL REFERENCES portfolios(id), symbol TEXT, type TEXT NOT NULL CHECK (type IN ('buy','sell','dividend','initial','deposit','withdrawal')), quantity REAL CHECK (quantity >= 0), price REAL NOT NULL CHECK (price >= 0), fee REAL NOT NULL DEFAULT 0 CHECK (fee >= 0), date TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), CHECK ((type IN ('deposit', 'withdrawal') AND symbol IS NULL AND quantity IS NULL) OR (type NOT IN ('deposit', 'withdrawal') AND symbol IS NOT NULL AND quantity IS NOT NULL)))",
      );
      await db.exec("INSERT INTO transactions SELECT * FROM transactions_new");
      await db.exec("DROP TABLE transactions_new");
      await db.exec("PRAGMA foreign_keys = ON");
    }
  } catch {
    // ignore schema migration errors
  }

  await db.exec("DELETE FROM stock_tags");
  await db.exec("DELETE FROM realized_pnl");
  await db.exec("DELETE FROM lots");
  await db.exec("DELETE FROM transactions");
  await db.exec("DELETE FROM portfolio_snapshots");
  await db.exec("DELETE FROM prices");
  await db.exec("DELETE FROM corporate_actions");
  await db.exec("DELETE FROM stocks");
  await db.exec("DELETE FROM tags");
  await db.exec("DELETE FROM api_tokens");
  await db.exec("DELETE FROM portfolios");
  await db.exec("DELETE FROM users");
  await db.exec("UPDATE portfolios SET cash_balance = 0");
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
