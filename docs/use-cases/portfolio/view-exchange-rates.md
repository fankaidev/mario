# UC-PORTFOLIO-011: Manage Exchange Rates

> Users can sync and query exchange rates for cross-currency portfolio aggregation. Rates are stored as daily values with USD as the base currency.

## Rules

| ID  | Rule                                                                                                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Exchange rates are stored per currency pair per date with USD as base currency (USD→CNY, USD→HKD)                                                                               |
| R2  | Rate lookup for a specific date returns exact match if available, otherwise falls back to most recent rate before that date                                                     |
| R3  | Same-currency conversion always returns rate of 1 (no lookup needed)                                                                                                            |
| R4  | Rate lookup returns null when no rate exists for the pair                                                                                                                       |
| R5  | Exchange rate sync fetches from Yahoo Finance API (USDCNY=X, USDHKD=X) and is idempotent                                                                                        |
| R6  | Exchange rates sync runs as part of the daily cron before price sync, fetching the last 7 days                                                                                  |
| R7  | Historical backfill is supported via POST /sync with start_date and end_date                                                                                                    |
| R8  | When a direct rate (from→to) is not stored, the inverse rate (1 / to→from) is used as fallback                                                                                  |
| R9  | For HKD↔CNY conversions without a direct rate, the cross-rate via USD is computed: HKD→CNY = (HKD→USD) / (CNY→USD)                                                              |
| R10 | Exchange rate list endpoint returns all matching records without artificial row limits, so frontend chart conversion has the full rate history needed for nearest-date fallback |

## Scenarios

### api-test

| ID                    | Priority | Status | Scenario                                                                                                                                           | Rules |
| --------------------- | -------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| UC-PORTFOLIO-011-S01  | P0       | ✅     | Given exchange rate CNY→USD = 0.14 on 2024-03-01, When looking up rate for CNY→USD on 2024-03-01, Then return 0.14                                 | R2    |
| UC-PORTFOLIO-011-S02  | P0       | ✅     | Given exchange rate CNY→USD = 0.14 on 2024-03-01 only, When looking up rate for 2024-03-05, Then return 0.14 (nearest earlier date)                | R2    |
| UC-PORTFOLIO-011-S03  | P0       | ✅     | When looking up rate for USD→USD, Then return 1                                                                                                    | R3    |
| UC-PORTFOLIO-011-S04  | P0       | ✅     | Given no exchange rates exist, When looking up rate for CNY→USD, Then return null                                                                  | R4    |
| UC-PORTFOLIO-011-S04b | P0       | ✅     | Given USD→HKD = 8, When looking up USD→HKD rate, Then return 8 (direct)                                                                            | R8    |
| UC-PORTFOLIO-011-S04c | P0       | ✅     | Given USD→HKD = 8 and USD→CNY = 10, When looking up HKD→CNY rate, Then return (1/8)/(1/10) = 1.25 (cross-rate via USD)                             | R9    |
| UC-PORTFOLIO-011-S05  | P1       | ✅     | Given sync inserts CNY→USD rates, When syncing again, Then second sync inserts 0 new records (idempotent)                                          | R5    |
| UC-PORTFOLIO-011-S06  | P0       | ✅     | Given more than 100 exchange rate records exist, When listing all exchange rates without filters, Then all records are returned without truncation | R10   |
