# UC-PORTFOLIO-010: Process Corporate Actions

> Users can record corporate actions (stock splits, reverse splits) which automatically adjust affected lot quantities via Event Sourcing.

## Rules

| ID | Rule |
|----|------|
| R1 | Stock split multiplies quantity and remaining_quantity by the split ratio for all open lots of the affected symbol |
| R2 | Reverse split (merge) divides quantity and remaining_quantity by the merge ratio for all open lots of the affected symbol |
| R3 | Only open lots (remaining_quantity > 0) are affected by corporate actions |
| R4 | Cost basis remains unchanged after a corporate action |
| R5 | Effective date is recorded on the corporate action record |
| R6 | Corporate actions on the same day as transactions are processed AFTER all transactions for that day |
| R7 | Corporate actions for a portfolio can be listed via the API, ordered by effective_date descending |

## Scenarios

### api-test

| ID | Priority | Status | Scenario | Rules |
|----|----------|--------|----------|-------|
| UC-PORTFOLIO-010-S01 | P0 | ✅ | Given portfolio has AAPL buy lot with 100 shares (remaining 100), When processing a 4:1 stock split, Then lot quantity becomes 400, remaining quantity becomes 400, cost basis unchanged | R1, R3, R4 |
| UC-PORTFOLIO-010-S02 | P1 | ✅ | Given portfolio has one open AAPL lot (100 shares sold to 0) before split, When processing a 4:1 stock split, Then closed lot quantity remains 100 | R3 |
| UC-PORTFOLIO-010-S03 | P1 | ✅ | Given a buy transaction and stock split occur on the same day, When replaying events, Then the buy is processed first, then the split multiplies the quantity | R6 |
| UC-PORTFOLIO-010-S04 | P1 | ✅ | Given portfolio has AAPL lot with 400 shares, When processing a 1:4 reverse split (merge ratio 4), Then lot quantity becomes 100, cost basis unchanged | R2, R4 |
| UC-PORTFOLIO-010-S05 | P0 | ✅ | Given portfolio with corporate actions, When listing corporate actions, Then return list with symbol, type, ratio, effective_date, created_at ordered by effective_date desc | R7 |
| UC-PORTFOLIO-010-S06 | P1 | ✅ | Given portfolio with no corporate actions, When listing corporate actions, Then return empty list | R7 |
| UC-PORTFOLIO-010-S07 | P1 | ❌ | Given a create form, When submitting valid symbol, type, ratio, and effective_date, Then a corporate action is created and appears in the list | R1, R5 |

### ai-e2e
(none)
