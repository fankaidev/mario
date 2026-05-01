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

## Scenarios

### api-test

| ID | Priority | Status | Scenario | Rules |
|----|----------|--------|----------|-------|
| UC-PORTFOLIO-003-S01 | P0 | ✅ | Given portfolio "US Stocks" has AAPL (lot1: remaining 20 @ 150, lot2: remaining 50 @ 160), and prices table shows AAPL latest price 180, When viewing holdings, Then return AAPL holding quantity 70, cost 11000 USD, market value 12600 USD, unrealized P&L 1600 USD, P&L rate 14.55% | R1, R2, R3, R4, R5, R6 |
| UC-PORTFOLIO-003-S02 | P0 | ✅ | Given all lots in portfolio are closed, When viewing holdings, Then return empty holdings list |
| UC-PORTFOLIO-003-S03 | P1 | ✅ | Given portfolio has holdings but prices table has no latest price for that stock, When viewing holdings, Then that stock's market value and P&L show as null |
| UC-PORTFOLIO-003-S04 | P1 | ✅ | Given user is not logged in, When viewing holdings, Then return 401 unauthorized | |

### ai-e2e

| ID | Priority | Status | Scenario | Rules |
|----|----------|--------|----------|-------|
| UC-PORTFOLIO-003-S05 | P1 | ❌ | Given holdings list contains AAPL (P&L rate +14%), TSLA (P&L rate -5%), NVDA (P&L rate +8%), When viewing by unrealizedPnlRate descending, Then order is AAPL, NVDA, TSLA | R8 |
| UC-PORTFOLIO-003-S06 | P1 | ❌ | Given holdings list contains multiple stocks, When viewing by symbol ascending, Then arranged alphabetically A-Z | R7 |
| UC-PORTFOLIO-003-S07 | P1 | ❌ | Given holdings list contains multiple stocks, When viewing by marketValue descending, Then arranged by market value high to low | R7 |
| UC-PORTFOLIO-003-S08 | P1 | ❌ | Given holdings list contains AAPL (cost 15000), TSLA (cost 5000), When viewing by cost descending, Then order is AAPL, TSLA | R7 |
| UC-PORTFOLIO-003-S09 | P1 | ❌ | Given holdings list sorted by symbol ascending, When clicking symbol header again, Then order becomes symbol descending Z-A | R9 |
