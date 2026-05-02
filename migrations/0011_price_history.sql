-- Create price_history table for historical daily close prices
CREATE TABLE price_history (
  symbol TEXT NOT NULL,
  date TEXT NOT NULL,
  close REAL NOT NULL,
  PRIMARY KEY (symbol, date)
);
CREATE INDEX idx_price_history_symbol ON price_history(symbol);

-- Migrate existing prices to price_history
INSERT INTO price_history (symbol, date, close)
SELECT symbol, DATE(updated_at), price FROM prices WHERE price IS NOT NULL;

-- Drop prices table
DROP TABLE prices;
