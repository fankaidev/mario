-- Add 'initial' as a valid transfer type for initial cash balance
-- SQLite doesn't support ALTER CHECK constraints, so we need to recreate the table

-- Step 1: Create new table with updated constraint
CREATE TABLE transfers_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  portfolio_id INTEGER NOT NULL REFERENCES portfolios(id),
  type TEXT NOT NULL CHECK (type IN ('deposit', 'withdrawal', 'initial')),
  amount REAL NOT NULL CHECK (amount > 0),
  fee REAL NOT NULL DEFAULT 0 CHECK (fee >= 0),
  date TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Step 2: Copy data
INSERT INTO transfers_new (id, portfolio_id, type, amount, fee, date, note, created_at)
SELECT id, portfolio_id, type, amount, fee, date, note, created_at FROM transfers;

-- Step 3: Drop old table
DROP TABLE transfers;

-- Step 4: Rename new table
ALTER TABLE transfers_new RENAME TO transfers;

-- Step 5: Recreate indexes
CREATE INDEX idx_transfers_portfolio_id ON transfers(portfolio_id);
CREATE INDEX idx_transfers_date ON transfers(portfolio_id, date DESC);
