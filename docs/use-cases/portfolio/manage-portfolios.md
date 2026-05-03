# UC-PORTFOLIO-001: Manage Portfolios

> Users can create, view, soft-delete, and restore their portfolios, each portfolio corresponding to a market + currency combination.

## Rules

| ID | Rule |
|----|------|
| R1 | Portfolio name is unique within a single user (including deleted portfolios) |
| R2 | Portfolios can be soft-deleted by owner. Deleted portfolios are hidden from all normal queries |
| R3 | Portfolio currency cannot be changed once set (USD/HKD/CNY) |
| R4 | Deleted portfolios can be restored by owner, making them visible again |
| R5 | Only portfolio owner can delete or restore a portfolio |

## Scenarios

### api-test

| ID | Priority | Status | Scenario | Rules |
|----|----------|--------|----------|-------|
| UC-PORTFOLIO-001-S01 | P0 | ✅ | Given user is logged in, When creating a portfolio named "US Stocks" with USD currency, Then return success, portfolio list contains this portfolio |
| UC-PORTFOLIO-001-S02 | P0 | ✅ | Given user already has a "HK Stocks" portfolio, When creating another portfolio with same name, Then return 409 conflict error | R1 |
| UC-PORTFOLIO-001-S03 | P0 | ✅ | Given user has created multiple portfolios, When fetching portfolio list, Then return all portfolios with name, currency, creation time |
| UC-PORTFOLIO-001-S04 | P1 | ✅ | Given user is not logged in, When creating a portfolio, Then return 401 unauthorized |
| UC-PORTFOLIO-001-S05 | P0 | ✅ | Given user has a portfolio, When deleting it, Then return success, deleted portfolio no longer appears in list | R2 |
| UC-PORTFOLIO-001-S06 | P0 | ✅ | Given user has deleted a portfolio, When fetching the deleted portfolio by ID, Then return 404 not found | R2 |
| UC-PORTFOLIO-001-S07 | P0 | ✅ | Given user has deleted a portfolio, When restoring it, Then return success, restored portfolio appears in list again | R4 |
| UC-PORTFOLIO-001-S08 | P1 | ✅ | Given user has a portfolio, When another user tries to delete it, Then return 404 not found | R5 |
| UC-PORTFOLIO-001-S09 | P1 | ✅ | Given user has a portfolio, When making an unauthenticated delete request, Then return 401 unauthorized |

### ai-e2e
(none)
