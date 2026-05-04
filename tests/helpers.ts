export async function cleanDatabase(db: D1Database) {
  // Ensure tables exist (unstable_dev may not apply migrations locally)
  const createStmts = [
    "CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL DEFAULT (datetime('now')))",
    "CREATE TABLE IF NOT EXISTS api_tokens (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL, token_hash TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), last_used_at TEXT)",
    "CREATE TABLE IF NOT EXISTS portfolios (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id), name TEXT NOT NULL, currency TEXT NOT NULL CHECK (currency IN ('USD', 'HKD', 'CNY')), created_at TEXT NOT NULL DEFAULT (datetime('now')), archived INTEGER NOT NULL DEFAULT 0, deleted_at TEXT DEFAULT NULL, UNIQUE(user_id, name))",
    "CREATE TABLE IF NOT EXISTS transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, portfolio_id INTEGER NOT NULL REFERENCES portfolios(id), symbol TEXT NOT NULL, type TEXT NOT NULL CHECK (type IN ('buy', 'sell', 'dividend', 'initial')), quantity REAL NOT NULL CHECK (quantity >= 0), price REAL NOT NULL CHECK (price >= 0), fee REAL NOT NULL DEFAULT 0 CHECK (fee >= 0), date TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')))",
    "CREATE TABLE IF NOT EXISTS lots (id INTEGER PRIMARY KEY AUTOINCREMENT, transaction_id INTEGER NOT NULL REFERENCES transactions(id), portfolio_id INTEGER NOT NULL REFERENCES portfolios(id), symbol TEXT NOT NULL, quantity REAL NOT NULL CHECK (quantity > 0), remaining_quantity REAL NOT NULL CHECK (remaining_quantity >= 0), cost_basis REAL NOT NULL CHECK (cost_basis >= 0), closed INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')))",
    "CREATE TABLE IF NOT EXISTS realized_pnl (id INTEGER PRIMARY KEY AUTOINCREMENT, sell_transaction_id INTEGER NOT NULL REFERENCES transactions(id), lot_id INTEGER NOT NULL REFERENCES lots(id), quantity REAL NOT NULL CHECK (quantity > 0), proceeds REAL NOT NULL, cost REAL NOT NULL, pnl REAL NOT NULL, sell_price REAL, cost_per_share REAL)",
    "CREATE TABLE IF NOT EXISTS prices (symbol TEXT PRIMARY KEY, price REAL, updated_at TEXT)",
    "CREATE TABLE IF NOT EXISTS tags (id INTEGER PRIMARY KEY AUTOINCREMENT, portfolio_id INTEGER NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE, name TEXT NOT NULL, UNIQUE(portfolio_id, name))",
    "CREATE TABLE IF NOT EXISTS stock_tags (portfolio_id INTEGER NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE, symbol TEXT NOT NULL, tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE, PRIMARY KEY (portfolio_id, symbol, tag_id))",
    "CREATE TABLE IF NOT EXISTS stocks (symbol TEXT PRIMARY KEY, name TEXT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS transfers (id INTEGER PRIMARY KEY AUTOINCREMENT, portfolio_id INTEGER NOT NULL REFERENCES portfolios(id), type TEXT NOT NULL CHECK (type IN ('deposit', 'withdrawal')), amount REAL NOT NULL CHECK (amount > 0), fee REAL NOT NULL DEFAULT 0 CHECK (fee >= 0), date TEXT NOT NULL, note TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')))",
    "CREATE TABLE IF NOT EXISTS portfolio_snapshots (id INTEGER PRIMARY KEY AUTOINCREMENT, portfolio_id INTEGER NOT NULL REFERENCES portfolios(id), date TEXT NOT NULL, total_investment REAL NOT NULL, market_value REAL NOT NULL, cash_balance REAL NOT NULL, note TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')))",
    "CREATE TABLE IF NOT EXISTS price_history (symbol TEXT NOT NULL, date TEXT NOT NULL, close REAL NOT NULL, PRIMARY KEY (symbol, date))",
    "CREATE TABLE IF NOT EXISTS corporate_actions (id INTEGER PRIMARY KEY AUTOINCREMENT, portfolio_id INTEGER NOT NULL REFERENCES portfolios(id), symbol TEXT NOT NULL, type TEXT NOT NULL, ratio REAL NOT NULL, effective_date TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')))",
  ];

  for (const stmt of createStmts) {
    await db.exec(stmt);
  }

  for (const table of [
    "stock_tags",
    "realized_pnl",
    "lots",
    "corporate_actions",
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
    await db.exec(`DELETE FROM ${table}`);
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
