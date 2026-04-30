-- Users (auto-created on first auth)
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- API tokens (SHA-256 hashed, for remote API access)
CREATE TABLE api_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT
);
CREATE INDEX idx_api_tokens_user_id ON api_tokens(user_id);
CREATE INDEX idx_api_tokens_token_hash ON api_tokens(token_hash);

-- Portfolios (one per currency, cannot be deleted, can be archived)
CREATE TABLE portfolios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  currency TEXT NOT NULL CHECK (currency IN ('USD', 'HKD', 'CNY')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  archived INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user_id, name)
);
CREATE INDEX idx_portfolios_user_id ON portfolios(user_id);

-- Transactions (append-only, cannot be edited)
CREATE TABLE transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  portfolio_id INTEGER NOT NULL REFERENCES portfolios(id),
  symbol TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('buy', 'sell', 'dividend')),
  quantity REAL NOT NULL CHECK (quantity > 0),
  price REAL NOT NULL CHECK (price >= 0),
  fee REAL NOT NULL DEFAULT 0 CHECK (fee >= 0),
  date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_transactions_portfolio_id ON transactions(portfolio_id);
CREATE INDEX idx_transactions_symbol ON transactions(symbol);
CREATE INDEX idx_transactions_date ON transactions(portfolio_id, date DESC, created_at DESC);

-- Lots (created by buy transactions, consumed by sells in FIFO order)
CREATE TABLE lots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id INTEGER NOT NULL REFERENCES transactions(id),
  portfolio_id INTEGER NOT NULL REFERENCES portfolios(id),
  symbol TEXT NOT NULL,
  quantity REAL NOT NULL CHECK (quantity > 0),
  remaining_quantity REAL NOT NULL CHECK (remaining_quantity >= 0),
  cost_basis REAL NOT NULL CHECK (cost_basis >= 0),
  closed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_lots_portfolio_symbol ON lots(portfolio_id, symbol);
CREATE INDEX idx_lots_fifo ON lots(symbol, closed, created_at);

-- Realized P&L (one per lot consumed in a sell)
CREATE TABLE realized_pnl (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sell_transaction_id INTEGER NOT NULL REFERENCES transactions(id),
  lot_id INTEGER NOT NULL REFERENCES lots(id),
  quantity REAL NOT NULL CHECK (quantity > 0),
  proceeds REAL NOT NULL,
  cost REAL NOT NULL,
  pnl REAL NOT NULL
);
CREATE INDEX idx_realized_pnl_sell_tx ON realized_pnl(sell_transaction_id);

-- Stock prices (shared across all users, updated by cron or manual trigger)
CREATE TABLE prices (
  symbol TEXT PRIMARY KEY,
  price REAL,
  updated_at TEXT
);

-- Tags (portfolio-scoped, user-defined)
CREATE TABLE tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  portfolio_id INTEGER NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  UNIQUE(portfolio_id, name)
);
CREATE INDEX idx_tags_portfolio_id ON tags(portfolio_id);

-- Stock tags (many-to-many between stocks and tags)
CREATE TABLE stock_tags (
  portfolio_id INTEGER NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (portfolio_id, symbol, tag_id)
);
CREATE INDEX idx_stock_tags_tag_id ON stock_tags(tag_id);
