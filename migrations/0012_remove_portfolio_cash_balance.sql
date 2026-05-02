-- Remove cash_balance column from portfolios table
-- D1 supports ALTER TABLE DROP COLUMN (SQLite 3.35+)
ALTER TABLE portfolios DROP COLUMN cash_balance;
