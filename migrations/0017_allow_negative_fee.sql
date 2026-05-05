-- Remove fee >= 0 constraint from transactions table
-- to allow negative fees for tax adjustments/reversals

CREATE TABLE transactions_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  portfolio_id INTEGER NOT NULL REFERENCES portfolios(id),
  symbol TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('buy', 'sell', 'dividend', 'initial')),
  quantity REAL NOT NULL CHECK (quantity >= 0),
  price REAL NOT NULL CHECK (price >= 0),
  fee REAL NOT NULL DEFAULT 0,
  date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO transactions_new SELECT * FROM transactions;
DROP TABLE transactions;
ALTER TABLE transactions_new RENAME TO transactions;

CREATE INDEX idx_transactions_portfolio ON transactions(portfolio_id);
CREATE INDEX idx_transactions_symbol ON transactions(symbol);

-- Remove fee >= 0 constraint from transfers table

CREATE TABLE transfers_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  portfolio_id INTEGER NOT NULL REFERENCES portfolios(id),
  type TEXT NOT NULL CHECK (type IN ('deposit', 'withdrawal', 'initial', 'interest')),
  amount REAL NOT NULL CHECK (amount > 0),
  fee REAL NOT NULL DEFAULT 0,
  date TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO transfers_new SELECT * FROM transfers;
DROP TABLE transfers;
ALTER TABLE transfers_new RENAME TO transfers;

CREATE INDEX idx_transfers_portfolio ON transfers(portfolio_id);
