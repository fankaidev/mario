-- Add cash_balance to portfolios
ALTER TABLE portfolios ADD COLUMN cash_balance REAL NOT NULL DEFAULT 0;

-- Recreate transactions table to:
-- 1. Allow deposit/withdrawal types
-- 2. Make symbol nullable for cash transactions
-- 3. Make quantity nullable for cash transactions

CREATE TABLE transactions_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  portfolio_id INTEGER NOT NULL REFERENCES portfolios(id),
  symbol TEXT,
  type TEXT NOT NULL CHECK (type IN ('buy', 'sell', 'dividend', 'initial', 'deposit', 'withdrawal')),
  quantity REAL CHECK (quantity >= 0),
  price REAL NOT NULL CHECK (price >= 0),
  fee REAL NOT NULL DEFAULT 0 CHECK (fee >= 0),
  date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (
    (type IN ('deposit', 'withdrawal') AND symbol IS NULL AND quantity IS NULL) OR
    (type NOT IN ('deposit', 'withdrawal') AND symbol IS NOT NULL AND quantity IS NOT NULL)
  )
);

INSERT INTO transactions_new SELECT * FROM transactions;

DROP TABLE transactions;

ALTER TABLE transactions_new RENAME TO transactions;

CREATE INDEX idx_transactions_portfolio_id ON transactions(portfolio_id);
CREATE INDEX idx_transactions_symbol ON transactions(symbol);
CREATE INDEX idx_transactions_date ON transactions(portfolio_id, date DESC, created_at DESC);
