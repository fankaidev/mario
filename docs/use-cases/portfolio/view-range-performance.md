# UC-PORTFOLIO-013: View Range-Scoped Portfolio Performance

> Users can view portfolio and aggregated performance metrics scoped to a specific time range (1M, 3M, 6M, YTD, 1Y, ALL) with backend-computed IRR, P&L, and currency conversion.

## Rules

| ID  | Rule                                                                                                                                           |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Performance endpoint accepts range parameter (1M, 3M, 6M, YTD, 1Y, ALL)                                                                       |
| R2  | For ALL range, start_value = 0 and metrics match cumulative portfolio summary                                                                 |
| R3  | For non-ALL ranges, start_value = portfolio value at or before range_start_date from latest snapshot                                          |
| R4  | Range P&L = end_value - start_value - net_cash_flow within range                                                                              |
| R5  | Range return_rate = annualized IRR using start_value as initial investment, period cash flows, and end_value as terminal value                |
| R6  | Aggregated performance converts all values to target currency using date-aware exchange rates                                                  |
| R7  | Aggregated chart data converts snapshot values per-date and forward-fills missing dates                                                        |
| R8  | Chart-series with range param returns range-scoped return_rate and pnl per point                                                              |
| R9  | When no snapshot exists at range start, performance endpoint returns 400                                                                      |
| R10 | Portfolio excluded from aggregation when exchange rate is missing for the portfolio currency at the required dates                            |
| R11 | Aggregated IRR combines all portfolios' converted cash flows into a single XIRR computation                                                   |

## Scenarios

### api-test

| ID                    | Priority | Status | Scenario                                                                                                   | Rules      |
| --------------------- | -------- | ------ | ---------------------------------------------------------------------------------------------------------- | ---------- |
| UC-PORTFOLIO-013-S01  | P0       | ✅     | Given a deposit of 10,000, When getting performance for ALL range, Then start_value = 0                    | R2         |
| UC-PORTFOLIO-013-S02  | P0       | ❌     | Given invalid range parameter, When requesting performance, Then return 400                                | R1         |
| UC-PORTFOLIO-013-S03  | P1       | ❌     | Given non-existent portfolio, When requesting performance, Then return 404                                 |            |
| UC-PORTFOLIO-013-S04  | P0       | ❌     | Given unauthenticated request, When requesting performance, Then return 401                                |            |
| UC-PORTFOLIO-013-S05  | P0       | ❌     | Given empty portfolio with no snapshots, When requesting non-ALL range performance, Then return 400        | R9         |
| UC-PORTFOLIO-013-S06  | P0       | ❌     | Given deposits and snapshot at range start, Then P&L = end_value - start_value - net_cash_flow             | R4         |
| UC-PORTFOLIO-013-S07  | P0       | ❌     | Given two same-currency portfolios, When getting aggregated performance, Then both are included            | R6         |
| UC-PORTFOLIO-013-S08  | P1       | ❌     | Given invalid range for aggregated performance, Then return 400                                            |            |
| UC-PORTFOLIO-013-S09  | P1       | ❌     | Given invalid currency for aggregated performance, Then return 400                                         |            |
| UC-PORTFOLIO-013-S10  | P0       | ❌     | Given unauthenticated request for aggregated performance, Then return 401                                  |            |
| UC-PORTFOLIO-013-S11  | P0       | ❌     | Given snapshots within range, Then chart endpoint returns forward-filled points with converted total_value | R7         |
| UC-PORTFOLIO-013-S12  | P1       | ❌     | Given unauthenticated chart request, Then return 401                                                       |            |
| UC-PORTFOLIO-013-S13  | P1       | ❌     | Given no snapshots, Then chart endpoint returns empty array                                                |            |
| UC-PORTFOLIO-013-S14  | P0       | ❌     | Given range param on chart-series, Then each point has range-scoped pnl                                    | R8         |
| UC-PORTFOLIO-013-S15  | P0       | ❌     | Given no range param on chart-series, Then pnl field is absent (backward compatible)                       |            |
