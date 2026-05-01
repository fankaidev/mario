# UC-PORTFOLIO-012: View Lot Details for Holding

> Users view detailed lot breakdown for each holding, showing individual buy lots with their cost basis and remaining quantities.

## Rules

| ID | Rule |
|----|------|
| R1 | Lot details are scoped to a holding within a portfolio: endpoint requires portfolio ID and symbol |
| R2 | Each lot shows: date (buy transaction date), buy price, quantity (original), remaining quantity, cost basis, current value, unrealized P&L, unrealized P&L rate, status |
| R3 | Lot cost basis = remaining_quantity × cost_basis / quantity (proportional to remaining shares) |
| R4 | Lot current value = remaining_quantity × latest price from prices table |
| R5 | Lot unrealized P&L = current value - cost basis |
| R6 | Lot unrealized P&L rate = unrealized P&L / cost basis × 100% |
| R7 | If no price in prices table, current value and P&L are null |
| R8 | Lot status = "open" when closed = 0, "closed" when closed = 1 |
| R9 | Lots are sorted by created_at ascending (FIFO order) by default |
| R10 | Response includes holding-level summary: symbol, name, total quantity across all open lots |
| R11 | Portfolio must belong to the authenticated user, otherwise 404 |
| R12 | Symbol must have lots in the portfolio, otherwise empty lots array with holding info |

## Scenarios

### api-test

| ID | Priority | Status | Scenario | Rules |
|----|----------|--------|----------|-------|
| UC-PORTFOLIO-012-S01 | P0 | ✅ | Given portfolio "US Stocks" has 2 AAPL lots (lot1: 20 shares @ 150, remaining 20; lot2: 50 shares @ 160, remaining 30) and AAPL price is 180, When viewing lot details for AAPL, Then lot1 shows cost basis 3000, P&L +600 (+20%), lot2 cost basis 4800, P&L +600 (+12.5%) | R2, R3, R4, R5, R6 |
| UC-PORTFOLIO-012-S02 | P0 | ✅ | Given portfolio has a fully sold lot (closed = 1, remaining = 0), When viewing lot details, Then that lot shows status "closed" | R8 |
| UC-PORTFOLIO-012-S03 | P1 | ✅ | Given portfolio has lots but prices table has no price for that symbol, When viewing lot details, Then each lot's current value and P&L show as null | R7 |
| UC-PORTFOLIO-012-S04 | P0 | ✅ | Given user requests lot details for a portfolio belonging to another user, When viewing lot details, Then return 404 | R11 |
| UC-PORTFOLIO-012-S05 | P1 | ✅ | Given symbol has no lots in the portfolio, When viewing lot details, Then return holding summary with empty lots array | R10, R12 |

### ai-e2e

| ID | Priority | Status | Scenario | Rules |
|----|----------|--------|----------|-------|
| UC-PORTFOLIO-012-S06 | P1 | ❌ | Given holding row in holdings tab, When clicking the row, Then lot details expand below the holding row showing all lots in FIFO order | R9 |
| UC-PORTFOLIO-012-S07 | P1 | ❌ | Given lot details are expanded, When clicking the holding row again, Then lot details collapse | R9 |