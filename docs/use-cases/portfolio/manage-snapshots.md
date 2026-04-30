# UC-PORTFOLIO-003: Manage Portfolio Snapshots

> Users can record historical portfolio snapshots for tracking total investment and market value over time. Weekly cron job auto-generates snapshots for active portfolios.

## Rules

| ID | Rule |
|----|------|
| R1 | Each portfolio can have at most one snapshot per date |
| R2 | Snapshot date must not be empty |
| R3 | Snapshot total_investment and market_value must be non-negative |
| R4 | Weekly cron auto-generates snapshot with current total investment and market value for each active portfolio |
| R5 | P&L for a snapshot = market_value - total_investment |
| R6 | Snapshot deletion is immediate and irreversible |

## Scenarios

### api-test

| ID | Priority | Status | Scenario | Rules |
|----|----------|--------|----------|-------|
| UC-PORTFOLIO-003-S01 | P0 | ❌ | Given portfolio exists with no snapshots, When creating snapshot with date, total investment, and market value, Then return 201 with snapshot data | R1, R2, R3 |
| UC-PORTFOLIO-003-S02 | P0 | ❌ | Given snapshot exists for 2024-12-31, When creating another snapshot for same date, Then return 409 conflict | R1 |
| UC-PORTFOLIO-003-S03 | P1 | ❌ | Given multiple snapshots exist, When fetching all snapshots, Then return snapshots sorted by date DESC | |
| UC-PORTFOLIO-003-S04 | P1 | ❌ | Given snapshot exists, When deleting snapshot, Then return 200 and snapshot no longer in list | R6 |
| UC-PORTFOLIO-003-S05 | P1 | ❌ | Given portfolio belongs to another user, When attempting to create snapshot, Then return 404 not found | |

### ai-e2e
(none)
