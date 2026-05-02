-- Recalculate cash_balance for all portfolios from transfers and transactions.
-- This is a one-time fix for portfolios whose transactions were created before
-- the cash_balance tracking was implemented.
UPDATE portfolios SET cash_balance = (
  COALESCE((SELECT SUM(CASE WHEN type = 'deposit' THEN amount - fee WHEN type = 'withdrawal' THEN -(amount + fee) END) FROM transfers WHERE portfolio_id = portfolios.id), 0)
  - COALESCE((SELECT SUM(quantity * price + fee) FROM transactions WHERE portfolio_id = portfolios.id AND type IN ('buy', 'initial')), 0)
  + COALESCE((SELECT SUM(quantity * price - fee) FROM transactions WHERE portfolio_id = portfolios.id AND type = 'sell'), 0)
  + COALESCE((SELECT SUM(price - fee) FROM transactions WHERE portfolio_id = portfolios.id AND type = 'dividend'), 0)
);
