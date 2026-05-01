-- Add cash_balance to portfolios
ALTER TABLE portfolios ADD COLUMN cash_balance REAL NOT NULL DEFAULT 0;
