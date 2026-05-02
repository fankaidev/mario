# UC-PORTFOLIO-008: Manage Portfolio Snapshots

> Users can record historical portfolio snapshots for tracking total investment and market value over time. Weekly cron job auto-generates snapshots for active portfolios. Calculated snapshots auto-compute values from transactions, transfers, and price_history.

## Rules

| ID | Rule |
|----|------|
| R1 | Each portfolio can have at most one snapshot per date |
| R2 | Snapshot date must not be empty |
| R3 | Manual snapshot total_investment, market_value, and cash_balance must be non-negative |
| R4 | Weekly cron auto-generates calculated snapshot with current total investment, market value, and cash balance for each active portfolio |
| R5 | P&L for a snapshot = market_value - total_investment |
| R6 | Snapshot deletion is immediate and irreversible |
| R7 | Calculated snapshot auto-computes: total_investment from net transfers up to date, market_value from FIFO holdings × price_history at date, cash_balance from transfers + transactions up to date |
| R8 | Calculated snapshot returns 422 if price_history is missing for any held symbol on that date |
| R9 | Calculated snapshot date defaults to today if not provided |
| R10 | Calculated snapshot date must not be in the future |
| R11 | Calculated snapshot returns 409 if a snapshot already exists for that date |

## Scenarios

### api-test

| ID | Priority | Status | Scenario | Rules |
|----|----------|--------|----------|-------|
| UC-PORTFOLIO-008-S01 | P0 | ✅ | Given portfolio exists with no snapshots, When creating manual snapshot with date, total investment, and market value, Then return 201 with snapshot data | R1, R2, R3 |
| UC-PORTFOLIO-008-S02 | P0 | ✅ | Given snapshot exists for 2024-12-31, When creating another snapshot for same date, Then return 409 conflict | R1 |
| UC-PORTFOLIO-008-S03 | P1 | ✅ | Given multiple snapshots exist, When fetching all snapshots, Then return snapshots sorted by date DESC | |
| UC-PORTFOLIO-008-S04 | P1 | ✅ | Given snapshot exists, When deleting snapshot, Then return 200 and snapshot no longer in list | R6 |
| UC-PORTFOLIO-008-S05 | P1 | ✅ | Given portfolio belongs to another user, When attempting to create snapshot, Then return 404 not found | |
| UC-PORTFOLIO-008-S06 | P0 | ❌ | Given portfolio has deposits, buys, and price_history, When creating calculated snapshot, Then total_investment is net deposits, market_value is holdings × price, cash_balance is transfers + transactions | R7 |
| UC-PORTFOLIO-008-S07 | P0 | ❌ | Given portfolio holds AAPL without price_history, When creating calculated snapshot, Then return 422 with missing symbol | R8 |
| UC-PORTFOLIO-008-S08 | P1 | ❌ | Given no date provided, When creating calculated snapshot, Then date defaults to today | R9 |
| UC-PORTFOLIO-008-S09 | P1 | ❌ | Given date is in the future, When creating calculated snapshot, Then return 400 | R10 |
| UC-PORTFOLIO-008-S10 | P1 | ❌ | Given snapshot already exists for date, When creating calculated snapshot, Then return 409 | R1, R11 |
| UC-PORTFOLIO-008-S11 | P1 | ❌ | Given portfolio has sells before date D, When creating calculated snapshot for date D, Then market_value reflects only remaining holdings after sells, cash_balance includes sell proceeds | R7 |
| UC-PORTFOLIO-008-S12 | P1 | ❌ | Given portfolio belongs to another user, When creating calculated snapshot, Then return 404 | |

### ai-e2e
(none)
