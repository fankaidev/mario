ALTER TABLE portfolios ADD COLUMN deleted_at TEXT DEFAULT NULL;
CREATE INDEX idx_portfolios_deleted_at ON portfolios(deleted_at);
