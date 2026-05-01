export async function cleanDatabase(db: D1Database) {
  await db.exec("CREATE TABLE IF NOT EXISTS stocks (symbol TEXT PRIMARY KEY, name TEXT NOT NULL)");
  try {
    await db.exec("ALTER TABLE portfolios ADD COLUMN cash_balance REAL NOT NULL DEFAULT 0");
  } catch {
    // column may already exist
  }
  try {
    await db.exec(
      "ALTER TABLE portfolio_snapshots ADD COLUMN cash_balance REAL NOT NULL DEFAULT 0",
    );
  } catch {
    // column may already exist
  }

  // Create transfers table if not exists
  await db.exec(
    "CREATE TABLE IF NOT EXISTS transfers (id INTEGER PRIMARY KEY AUTOINCREMENT, portfolio_id INTEGER NOT NULL REFERENCES portfolios(id), type TEXT NOT NULL CHECK (type IN ('deposit', 'withdrawal')), amount REAL NOT NULL CHECK (amount > 0), fee REAL NOT NULL DEFAULT 0 CHECK (fee >= 0), date TEXT NOT NULL, note TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')))",
  );

  await db.exec("DELETE FROM stock_tags");
  await db.exec("DELETE FROM realized_pnl");
  await db.exec("DELETE FROM lots");
  await db.exec("DELETE FROM transactions");
  await db.exec("DELETE FROM transfers");
  await db.exec("DELETE FROM portfolio_snapshots");
  await db.exec("DELETE FROM prices");
  await db.exec("DELETE FROM corporate_actions");
  await db.exec("DELETE FROM stocks");
  await db.exec("DELETE FROM tags");
  await db.exec("DELETE FROM api_tokens");
  await db.exec("DELETE FROM portfolios");
  await db.exec("DELETE FROM users");
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
