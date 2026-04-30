-- Fix cost_basis to include buy fee
UPDATE lots SET cost_basis = cost_basis + COALESCE((SELECT fee FROM transactions WHERE id = lots.transaction_id), 0);

-- Add sell detail fields to realized_pnl
ALTER TABLE realized_pnl ADD sell_price REAL;
ALTER TABLE realized_pnl ADD cost_per_share REAL;

-- Populate sell_price from existing data
UPDATE realized_pnl SET sell_price = proceeds / quantity;

-- Update realized_pnl to include sell fee in pnl calculation
UPDATE realized_pnl SET pnl = (proceeds - COALESCE((SELECT fee FROM transactions WHERE id = realized_pnl.sell_transaction_id), 0)) - cost;

-- Corporate actions audit table
CREATE TABLE corporate_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  portfolio_id INTEGER NOT NULL REFERENCES portfolios(id),
  symbol TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('split', 'merge')),
  ratio REAL NOT NULL CHECK (ratio > 0),
  effective_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
