# UC-PORTFOLIO-005: Update Stock Prices

> System fetches latest prices for held stocks from Finnhub/Yahoo Finance, supporting weekly auto-update and manual trigger.

## Rules

| ID | Rule |
|----|------|
| R1 | Only fetch prices for stocks with current holdings (stocks without holdings are not updated) |
| R2 | After successful fetch, write to prices table, overwrite old price, record update timestamp |
| R3 | Single stock fetch failure does not affect other stocks' updates |
| R4 | API failure logs error, does not interrupt the flow |
| R5 | Manual update and auto update share the same update logic |
| R6 | Price update also fetches and stores company name in stocks table |
| R7 | Symbols ending in `.HK`, `.SS`, `.SZ` use Yahoo Finance; all others use Finnhub |

## Scenarios

### api-test

| ID | Priority | Status | Scenario | Rules |
|----|----------|--------|----------|-------|
| UC-PORTFOLIO-005-S01 | P0 | ✅ | Given portfolio holds AAPL and TSLA, When manually triggering price update, Then call price API to get latest prices for both, write to prices table, return success with stock count | R1 |
| UC-PORTFOLIO-005-S02 | P0 | ✅ | Given portfolio holds AAPL, and API returns AAPL price as 175.50, When price update completes, Then prices table shows AAPL as 175.50, update timestamp is current time | R2 |
| UC-PORTFOLIO-005-S03 | P1 | ✅ | Given portfolio holds AAPL and TSLA, and TSLA API call fails, When manually triggering update, Then AAPL price updates successfully, TSLA logs error, overall returns partial success | R3, R4 |
| UC-PORTFOLIO-005-S04 | P1 | ✅ | Given portfolio has no holdings, When manually triggering update, Then return 0 stocks updated | R1 |
| UC-PORTFOLIO-005-S05 | P1 | ✅ | Given user is not logged in, When manually triggering update, Then return 401 unauthorized |
| UC-PORTFOLIO-005-S06 | P1 | ✅ | Given portfolio holds AAPL, and API returns AAPL name "Apple Inc", When price update completes, Then stocks table shows AAPL name as "Apple Inc" | R6 |
| UC-PORTFOLIO-005-S07 | P0 | ❌ | Given portfolio holds 0700.HK and 600519.SS, When manually triggering price update, Then Yahoo Finance API is called for both, prices are written to prices table | R1, R7 |
| UC-PORTFOLIO-005-S08 | P0 | ❌ | Given portfolio holds AAPL and 0700.HK, When manually triggering price update, Then Finnhub is called for AAPL, Yahoo Finance is called for 0700.HK, both prices are updated | R7 |

### ai-e2e
(none)
