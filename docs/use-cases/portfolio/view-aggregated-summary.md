# UC-PORTFOLIO-012: View Aggregated Portfolio Summary

> Users can view aggregated portfolio metrics across multiple portfolios converted to a single target currency (USD/HKD/CNY).

## Rules

| ID | Rule |
|----|------|
| R1 | Aggregated summary endpoint accepts a target currency parameter (`?currency=USD`), defaults to USD |
| R2 | All non-deleted portfolios are included in the aggregation |
| R3 | Each portfolio's native-currency summary is calculated and returned alongside a converted summary |
| R4 | When portfolio currency matches target currency, native and converted summaries are identical |
| R5 | When exchange rate is available, portfolio values are converted to target currency |
| R6 | When exchange rate is not available, portfolio is included with `converted_summary: null` and excluded from aggregated totals |
| R7 | Aggregated `return_rate` = converted total_pnl / converted total_investment × 100% |
| R8 | `price_updated_at` = oldest price date across all held symbols in all portfolios |
| R9 | `exchange_rate_updated_at` = oldest rate date used in any currency conversion |
| R10 | Endpoint requires authentication |

## Scenarios

### api-test

| ID | Priority | Status | Scenario | Rules |
|----|----------|--------|----------|-------|
| UC-PORTFOLIO-012-S01 | P0 | ✅ | Given single USD portfolio with holdings, When requesting aggregated summary in USD, Then native and converted summaries are identical, all values match | R1, R4 |
| UC-PORTFOLIO-012-S02 | P0 | ✅ | Given two USD portfolios with deposits, When requesting aggregated summary in USD, Then total investment = sum of both portfolios' investments | R1, R2 |
| UC-PORTFOLIO-012-S03 | P0 | ✅ | Given HKD portfolio with exchange rate 0.128 HKD→USD, When requesting aggregated summary in USD, Then converted values = native values × 0.128 | R5 |
| UC-PORTFOLIO-012-S04 | P0 | ✅ | Given mixed HKD+CNY+USD portfolios all with exchange rates, When requesting aggregated summary in USD, Then all three have converted summaries and aggregated totals are the sum | R5, R7 |
| UC-PORTFOLIO-012-S05 | P1 | ✅ | Given HKD portfolio with no exchange rate available, When requesting aggregated summary in USD, Then portfolio has converted_summary: null and is excluded from aggregated totals | R6 |
| UC-PORTFOLIO-012-S06 | P1 | ✅ | Given portfolio with no transactions, When requesting aggregated summary, Then all metrics return 0 | R1 |
| UC-PORTFOLIO-012-S07 | P0 | ✅ | Given unauthenticated request, When requesting aggregated summary, Then return 401 | R10 |
| UC-PORTFOLIO-012-S08 | P0 | ✅ | Given active and deleted portfolios, When requesting aggregated summary, Then deleted portfolio is excluded | R2 |
| UC-PORTFOLIO-012-S09 | P1 | ✅ | Given HKD and CNY rates with different dates, When requesting aggregated summary in USD, Then exchange_rate_updated_at = oldest rate date used | R9 |
