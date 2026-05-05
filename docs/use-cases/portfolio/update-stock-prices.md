# UC-PORTFOLIO-005: Update Stock Prices

> System fetches latest prices for held stocks from Finnhub/Yahoo Finance/Eastmoney, supporting weekly auto-update and historical daily close sync via API.

## Rules

| ID | Rule |
|----|------|
| R1 | Only fetch prices for stocks with current holdings (stocks without holdings are not updated) |
| R2 | Prices are stored in price_history table with (symbol, date, close) as composite primary key; newer values overwrite older ones for the same date |
| R3 | Single stock fetch failure does not affect other stocks' updates |
| R4 | API failure logs error, does not interrupt the flow |
| R5 | Cron auto-update uses historical sync logic (syncPriceHistory) |
| R6 | Price update also fetches and stores company name in stocks table |
| R7 | Symbols ending in `.HK`, `.SS`, `.SZ` use Eastmoney; 6-digit codes without suffix use Eastmoney; all others use Finnhub |
| R8 | Historical price sync fetches daily close prices from fetcher's fetchHistory method; US stocks use Yahoo Finance for history (Finnhub has no history API); CN/HK stocks use Eastmoney for history |
| R9 | Historical sync skips dates already present in price_history by fetching from last known date + 1 |
| R10 | Zero is a valid price (e.g., expired warrants, CBBC) and must be stored and displayed, not treated as null/missing |

## Scenarios

### api-test

| ID | Priority | Status | Scenario | Rules |
|----|----------|--------|----------|-------|
| UC-PORTFOLIO-005-S01 | P0 | ✅ | Given portfolio holds AAPL and TSLA, When syncing price history, Then fetchHistory is called for both, daily close prices are written to price_history table, return record count | R1, R8 |
| UC-PORTFOLIO-005-S02 | P1 | ❌ | Given portfolio holds AAPL, and Yahoo Finance returns history data, When sync completes, Then price_history table contains the historical records with correct dates and close prices | R2, R8 |
| UC-PORTFOLIO-005-S03 | P1 | ❌ | Given portfolio holds multiple symbols and one fetcher fails, When syncing, Then other symbols sync successfully, failed symbol logs error, overall returns partial results | R3, R4 |
| UC-PORTFOLIO-005-S04 | P1 | ✅ | Given portfolio has no holdings, When syncing, Then return 0 records | R1 |
| UC-PORTFOLIO-005-S05 | P1 | ✅ | Given user is not logged in, When manually triggering sync, Then return 401 unauthorized | |
| UC-PORTFOLIO-005-S06 | P1 | ❌ | Given portfolio holds AAPL, and Finnhub returns AAPL name "Apple Inc", When price update completes, Then stocks table shows AAPL name as "Apple Inc" | R6 |
| UC-PORTFOLIO-005-S07 | P0 | ✅ | Given portfolio holds 0700.HK and 600519.SS, When syncing price history, Then Eastmoney fetchHistory is called for both, prices are written to price_history table | R1, R7, R8 |
| UC-PORTFOLIO-005-S08 | P0 | ✅ | Given portfolio holds AAPL and 0700.HK, When syncing price history, Then Yahoo is called for AAPL (US stocks use Yahoo for history), Eastmoney for 0700.HK, both prices are updated | R7, R8 |
| UC-PORTFOLIO-005-S09 | P0 | ✅ | Given portfolio holds mutual funds 000979 and 000217, When syncing price history, Then Eastmoney fetchHistory is called for both, NAVs are written to price_history table | R1, R7 |
| UC-PORTFOLIO-005-S10 | P0 | ✅ | Given portfolio holds AAPL, 0700.HK, and 000979, When syncing price history, Then Yahoo is called for AAPL, Eastmoney for 0700.HK and 000979, all prices are updated | R7, R8 |
| UC-PORTFOLIO-005-S11 | P1 | ❌ | Given price_history already has AAPL data up to 2024-01-15, When syncing, Then fetchHistory is called starting from 2024-01-16, existing records are not re-fetched | R9 |
| UC-PORTFOLIO-005-S12 | P0 | ✅ | Given portfolio holds an expired warrant, When syncing price history with close=0, Then price is stored as 0 (not null), and getLatestPrice returns 0 | R10 |

### ai-e2e
(none)
