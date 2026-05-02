# UC-PORTFOLIO-003: View Holdings

> Users view stocks currently held in a portfolio and their P&L, with support for multiple sort options.

## Rules

| ID | Rule |
|----|------|
| R1 | Holding quantity = sum of remaining quantities of all unclosed lots |
| R2 | Holding cost = sum of (remaining quantity × buy price + corresponding buy fee) for all unclosed lots |
| R3 | Holding market value = holding quantity × latest stock price (from prices table) |
| R4 | Unrealized P&L = holding market value - holding cost |
| R5 | Unrealized P&L rate = unrealized P&L / holding cost × 100% |
| R6 | P&L and rate rounded to two decimal places |
| R7 | Supported sort fields: symbol (alphabetical), quantity (holding quantity), cost, marketValue, unrealizedPnl (P&L amount), unrealizedPnlRate (P&L rate) |
| R8 | Default sort: unrealizedPnlRate descending |
| R9 | Clicking a sortable column header toggles between ascending and descending order |
| R10 | Clicking a different column resets to ascending order |
| R11 | Each holding includes stock name from stocks table, fallback to symbol if not yet populated |
| R12 | Clicking a holding row expands to show lot details and price history chart |
| R13 | Price history chart shows daily close prices for the selected date range (1M, 3M, 1Y, 3Y, All) |

## Scenarios

### api-test

| ID | Priority | Status | Scenario | Rules |
|----|----------|--------|----------|-------|
| UC-PORTFOLIO-003-S01 | P0 | ✅ | Given portfolio "US Stocks" has AAPL (lot1: remaining 20 @ 150, lot2: remaining 50 @ 160), and prices table shows AAPL latest price 180, When viewing holdings, Then return AAPL holding quantity 70, cost 11000 USD, market value 12600 USD, unrealized P&L 1600 USD, P&L rate 14.55% | R1, R2, R3, R4, R5, R6 |
| UC-PORTFOLIO-003-S02 | P0 | ✅ | Given all lots in portfolio are closed, When viewing holdings, Then return empty holdings list |
| UC-PORTFOLIO-003-S03 | P1 | ✅ | Given portfolio has holdings but prices table has no latest price for that stock, When viewing holdings, Then that stock's market value and P&L show as null |
| UC-PORTFOLIO-003-S04 | P1 | ✅ | Given user is not logged in, When viewing holdings, Then return 401 unauthorized | |
| UC-PORTFOLIO-003-S08 | P0 | ✅ | Given portfolio holds AAPL and stocks table has AAPL name "Apple Inc", When viewing holdings, Then AAPL holding returns name "Apple Inc" | R11 |
| UC-PORTFOLIO-003-S09 | P1 | ✅ | Given portfolio holds AAPL but stocks table has no entry for AAPL, When viewing holdings, Then AAPL holding returns name "AAPL" (symbol fallback) | R11 |
| UC-PORTFOLIO-003-S12 | P0 | ✅ | Given portfolio holds AAPL with price history from 2024-01-01 to 2024-03-01, When viewing holdings and clicking AAPL row, Then price history chart shows AAPL daily close prices | R12, R13 |
| UC-PORTFOLIO-003-S13 | P1 | ✅ | Given user requests price history for AAPL with start_date=2024-02-01 and end_date=2024-02-28, When calling GET /api/prices/history/AAPL, Then returns only prices within that date range | R13 |
| UC-PORTFOLIO-003-S14 | P1 | ✅ | Given user is not logged in, When calling GET /api/prices/history/AAPL, Then return 401 unauthorized | |
| UC-PORTFOLIO-003-S15 | P1 | ✅ | Given user requests price history for NVDA, When calling GET /api/prices/history/NVDA, Then returns empty prices array | R13 |

### ai-e2e

| ID | Priority | Status | Scenario | Rules |
|----|----------|--------|----------|-------|
| UC-PORTFOLIO-003-S05 | P1 | ❌ | Given holdings list contains AAPL (P&L rate +14%), TSLA (P&L rate -5%), NVDA (P&L rate +8%), When viewing by unrealizedPnlRate descending, Then order is AAPL, NVDA, TSLA | R8 |
| UC-PORTFOLIO-003-S06 | P1 | ❌ | Given holdings list contains multiple stocks, When viewing by symbol ascending, Then arranged alphabetically A-Z | R7 |
| UC-PORTFOLIO-003-S07 | P1 | ❌ | Given holdings list contains multiple stocks, When viewing by marketValue descending, Then arranged by market value high to low | R7 |
| UC-PORTFOLIO-003-S10 | P1 | ❌ | Given holdings list contains AAPL (cost 15000), TSLA (cost 5000), When viewing by cost descending, Then order is AAPL, TSLA | R7 |
| UC-PORTFOLIO-003-S11 | P1 | ❌ | Given holdings list sorted by symbol ascending, When clicking symbol header again, Then order becomes symbol descending Z-A | R9 |
