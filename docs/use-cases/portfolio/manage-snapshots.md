# UC-PORTFOLIO-008: Manage Portfolio Snapshots

> Users can record historical portfolio snapshots for tracking total investment and market value over time. Weekly cron job auto-generates snapshots for active portfolios. Calculated snapshots auto-compute values from transactions, transfers, and price_history. Manual snapshots can be used to calibrate values when there are errors or gaps in transaction/transfer history - subsequent calculated snapshots will use the calibrated values as baseline, preventing historical data issues from polluting future snapshots.

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
| R12 | If a previous snapshot exists, calculated snapshot uses it as baseline: total_investment = prev + period transfers, cash_balance = prev + period transfers + period transactions. This allows manual corrections to "calibrate" values |
| R13 | Interest transfers are excluded from total_investment calculation but included in cash_balance |
| R14 | Snapshots do not store return_rate; all return rates are derived dynamically via chart-series endpoint |
| R15 | Chart series endpoint returns snapshots with dynamically derived return rates (IRR-based) |
| R16 | Chart series return rates are computed using cash flows up to each snapshot date, with portfolio value (market_value + cash_balance) as terminal value |

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
| UC-PORTFOLIO-008-S13 | P0 | ✅ | Given previous snapshot exists with calibrated cash_balance, When creating calculated snapshot for later date, Then new cash_balance = prev cash_balance + period changes | R12 |
| UC-PORTFOLIO-008-S14 | P1 | ✅ | Given previous snapshot exists, When adding interest transfer and creating calculated snapshot, Then interest is included in cash_balance but excluded from total_investment | R12, R13 |
| UC-PORTFOLIO-008-S15 | P1 | ✅ | Given transfers and holdings up to a date, When creating calculated snapshot, Then snapshot is created without return_rate (return_rate derived via chart-series) | R14 |
| UC-PORTFOLIO-008-S16 | P0 | ✅ | Given portfolio with snapshots and cash flow history, When fetching chart-series, Then return snapshots sorted by date ASC with dynamically derived return rates | R15, R16 |
| UC-PORTFOLIO-008-S17 | P1 | ✅ | Given multiple deposits at different dates before a snapshot, When fetching chart-series, Then return_rate is computed using IRR from all cash flows up to snapshot date | R15, R16 |
| UC-PORTFOLIO-008-S18 | P1 | ✅ | Given portfolio belongs to another user, When fetching chart-series, Then return 404 not found | |
| UC-PORTFOLIO-008-S19 | P1 | ✅ | Given portfolio with no snapshots, When fetching chart-series, Then return empty array | R15 |

### ai-e2e
(none)
