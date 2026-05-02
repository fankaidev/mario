-- Remove cash_balance column from portfolios table
-- SQLite doesn't support DROP COLUMN, so we recreate the table

CREATE TABLE portfolios_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  currency TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  archived INTEGER NOT NULL DEFAULT 0
);

INSERT INTO portfolios_new SELECT id, user_id, name, currency, created_at, archived FROM portfolios;

DROP TABLE portfolios;
ALTER TABLE portfolios_new RENAME TO portfolios;

CREATE INDEX idx_portfolios_user_id ON portfolios(user_id);
