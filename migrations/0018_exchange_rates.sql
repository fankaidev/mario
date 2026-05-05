-- Exchange rates for multi-currency portfolio aggregation.
-- Stores daily rates with USD as the base (to_currency).
-- Rates represent: 1 from_currency = rate to_currency

CREATE TABLE exchange_rates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_currency TEXT NOT NULL CHECK (from_currency IN ('USD', 'HKD', 'CNY')),
  to_currency TEXT NOT NULL CHECK (to_currency IN ('USD', 'HKD', 'CNY')),
  date TEXT NOT NULL,
  rate REAL NOT NULL CHECK (rate > 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(from_currency, to_currency, date)
);

CREATE INDEX idx_exchange_rates_pair ON exchange_rates(from_currency, to_currency);
CREATE INDEX idx_exchange_rates_date ON exchange_rates(date);
