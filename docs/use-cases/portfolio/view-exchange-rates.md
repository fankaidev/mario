# UC-PORTFOLIO-011: Manage Exchange Rates

> Users can sync and query exchange rates for cross-currency portfolio aggregation. Rates are stored as daily values with USD as the base currency.

## Rules

| ID | Rule |
|----|------|
| R1 | Exchange rates are stored per currency pair per date (e.g., CNY→USD, HKD→USD) |
| R2 | Rate lookup for a specific date returns exact match if available, otherwise falls back to most recent rate before that date |
| R3 | Same-currency conversion always returns rate of 1 (no lookup needed) |
| R4 | Rate lookup returns null when no rate exists for the pair |
| R5 | Exchange rate sync fetches from frankfurter.app API (CNY→USD, HKD→USD) and is idempotent |
| R6 | Exchange rates sync runs as part of the weekly cron before price sync |
| R7 | Historical backfill is supported via POST /sync with start_date and end_date |
| R8 | When a direct rate (from→to) is not stored, the inverse rate (1 / to→from) is used as fallback |
| R9 | For HKD↔CNY conversions without a direct rate, the cross-rate via USD is computed: HKD→CNY = (HKD→USD) / (CNY→USD) |

## Scenarios

### api-test

| ID | Priority | Status | Scenario | Rules |
|----|----------|--------|----------|-------|
| UC-PORTFOLIO-011-S01 | P0 | ✅ | Given exchange rate CNY→USD = 0.14 on 2024-03-01, When looking up rate for CNY→USD on 2024-03-01, Then return 0.14 | R2 |
| UC-PORTFOLIO-011-S02 | P0 | ✅ | Given exchange rate CNY→USD = 0.14 on 2024-03-01 only, When looking up rate for 2024-03-05, Then return 0.14 (nearest earlier date) | R2 |
| UC-PORTFOLIO-011-S03 | P0 | ✅ | When looking up rate for USD→USD, Then return 1 | R3 |
| UC-PORTFOLIO-011-S04 | P0 | ✅ | Given no exchange rates exist, When looking up rate for CNY→USD, Then return null | R4 |
| UC-PORTFOLIO-011-S04b | P0 | ✅ | Given HKD→USD = 0.128, When looking up USD→HKD rate, Then return 1/0.128 ≈ 7.8125 (inverse fallback) | R8 |
| UC-PORTFOLIO-011-S04c | P0 | ✅ | Given HKD→USD = 0.128 and CNY→USD = 0.14, When looking up HKD→CNY rate, Then return 0.128/0.14 ≈ 0.9143 (cross-rate via USD) | R9 |
| UC-PORTFOLIO-011-S05 | P1 | ✅ | Given sync inserts CNY→USD rates, When syncing again, Then second sync inserts 0 new records (idempotent) | R5 |
