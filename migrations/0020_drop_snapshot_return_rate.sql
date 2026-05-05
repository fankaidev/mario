-- Drop return_rate column from portfolio_snapshots
-- Return rates are now derived dynamically via /snapshots/chart-series endpoint
ALTER TABLE portfolio_snapshots DROP COLUMN return_rate;
