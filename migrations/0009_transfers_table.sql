-- Create transfers table for deposit/withdrawal (separate from stock transactions)
CREATE TABLE transfers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  portfolio_id INTEGER NOT NULL REFERENCES portfolios(id),
  type TEXT NOT NULL CHECK (type IN ('deposit', 'withdrawal')),
  amount REAL NOT NULL CHECK (amount > 0),
  fee REAL NOT NULL DEFAULT 0 CHECK (fee >= 0),
  date TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_transfers_portfolio_id ON transfers(portfolio_id);
CREATE INDEX idx_transfers_date ON transfers(portfolio_id, date DESC);
