# UC-PORTFOLIO-014: View Cash Movements

> Users view a unified timeline of all cash balance movements (transfers and transactions) in chronological order with running cash balance.

## Rules

| ID | Rule |
|----|------|
| R1 | Cash movements include deposits, withdrawals, buys, sells, dividends, and initials |
| R2 | Each movement shows the cash delta (positive for inflows, negative for outflows) |
| R3 | Running cash balance is calculated by interleaving all transfers and transactions chronologically |
| R4 | Events are sorted by date, then created_at for same-date events |
| R5 | Cash movements are returned in reverse chronological order (newest first) |
| R6 | Cash movements can be filtered by type on the frontend; when no types are selected, all types are shown |

## Scenarios

### api-test

| ID | Priority | Status | Scenario | Rules |
|----|----------|--------|----------|-------|
| UC-PORTFOLIO-014-S01 | P0 | ✅ | Given portfolio with no transfers or transactions, When fetching cash movements, Then return empty list | R1 |
| UC-PORTFOLIO-014-S02 | P0 | ✅ | Given portfolio with deposit 10000, When fetching cash movements, Then return one movement with amount=10000 and cash_balance=10000 | R1, R2 |
| UC-PORTFOLIO-014-S03 | P0 | ✅ | Given deposit 10000 then buy AAPL 10@150 (cost=1500), When fetching cash movements, Then deposit shows balance=10000, buy shows amount=-1500 and balance=8500 | R2, R3 |
| UC-PORTFOLIO-014-S04 | P0 | ✅ | Given deposit on 2024-01-01 and buy on 2024-01-15, When fetching cash movements, Then deposit appears before buy in chronological order | R4 |
| UC-PORTFOLIO-014-S05 | P1 | ✅ | Given deposit 10000, buy AAPL 10@150 (fee=5), sell AAPL 5@200 (fee=5), dividend 50 (tax=5), withdrawal 1000 (fee=10), When fetching cash movements, Then all 5 movements appear with correct amounts and running balances | R1, R2, R3 |
| UC-PORTFOLIO-014-S06 | P1 | ✅ | Given multiple movements, When fetching cash movements, Then results are in reverse chronological order (newest first) | R5 |

### ai-e2e

| ID | Priority | Status | Scenario | Rules |
|----|----------|--------|----------|-------|
| UC-PORTFOLIO-014-S07 | P2 | ❌ | Given movements of multiple types, When filtering by type (e.g. "buy"), Then only movements matching the selected types are shown | R6 |
