-- Drop lots and realized_pnl tables
-- These are materialized views that can be calculated on-demand via FIFO replay
-- Migration to CQRS/Event Sourcing architecture

DROP TABLE IF EXISTS realized_pnl;
DROP TABLE IF EXISTS lots;
