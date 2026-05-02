DROP INDEX IF EXISTS idx_lots_fifo;
CREATE INDEX idx_lots_fifo ON lots(symbol, created_at);
ALTER TABLE lots DROP COLUMN closed;
