# UC-PORTFOLIO-001: Manage Portfolios

> Users can create and view their portfolios, each portfolio corresponding to a market + currency combination.

## Rules

| ID | Rule |
|----|------|
| R1 | Portfolio name is unique within a single user |
| R2 | Portfolios cannot be deleted after creation, but can be archived |
| R3 | Portfolio currency cannot be changed once set (USD/HKD/CNY) |

## Scenarios

### api-test

| ID | Priority | Status | Scenario | Rules |
|----|----------|--------|----------|-------|
| UC-PORTFOLIO-001-S01 | P0 | ❌ | Given user is logged in, When creating a portfolio named "US Stocks" with USD currency, Then return success, portfolio list contains this portfolio |
| UC-PORTFOLIO-001-S02 | P0 | ❌ | Given user already has a "HK Stocks" portfolio, When creating another portfolio with same name, Then return 409 conflict error | R1 |
| UC-PORTFOLIO-001-S03 | P0 | ❌ | Given user has created multiple portfolios, When fetching portfolio list, Then return all portfolios with name, currency, creation time |
| UC-PORTFOLIO-001-S04 | P1 | ❌ | Given user is not logged in, When creating a portfolio, Then return 401 unauthorized |

### ai-e2e
(none)
