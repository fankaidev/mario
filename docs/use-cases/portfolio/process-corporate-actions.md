# UC-PORTFOLIO-010: Process Corporate Actions

> Users can record corporate actions (stock splits, reverse splits) which automatically adjust affected lot quantities.

## Rules

| ID | Rule |
|----|------|
| R1 | Stock split multiplies quantity and remaining_quantity by the split ratio for all open lots of the affected symbol |
| R2 | Reverse split (merge) divides quantity and remaining_quantity by the merge ratio for all open lots of the affected symbol |
| R3 | Only open lots (closed=0) are affected by corporate actions |
| R4 | Cost basis remains unchanged after a corporate action |
| R5 | Effective date is recorded on the corporate action record |

## Scenarios

### api-test

| ID | Priority | Status | Scenario | Rules |
|----|----------|--------|----------|-------|
| UC-PORTFOLIO-010-S01 | P0 | ✅ | Given portfolio has AAPL buy lot with 100 shares (remaining 100), When processing a 4:1 stock split, Then lot quantity becomes 400, remaining quantity becomes 400, cost basis unchanged | R1, R3, R4 |
| UC-PORTFOLIO-010-S02 | P1 | ✅ | Given portfolio has one open AAPL lot (100 shares) and one closed AAPL lot (100 shares), When processing a 4:1 stock split, Then only open lot quantity changes, closed lot remains 100 | R3 |

### ai-e2e
(none)
