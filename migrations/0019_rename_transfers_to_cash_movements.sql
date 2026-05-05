-- Rename transfers table to cash_movements
ALTER TABLE transfers RENAME TO cash_movements;

-- Drop all historical index variants
DROP INDEX IF EXISTS idx_transfers_portfolio_id;
DROP INDEX IF EXISTS idx_transfers_portfolio_date;
DROP INDEX IF EXISTS idx_transfers_portfolio;
DROP INDEX IF EXISTS idx_transfers_date;

-- Create new indexes
CREATE INDEX idx_cash_movements_portfolio_id ON cash_movements(portfolio_id);
CREATE INDEX idx_cash_movements_portfolio_date ON cash_movements(portfolio_id, date);
