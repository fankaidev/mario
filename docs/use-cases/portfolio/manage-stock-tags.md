# UC-PORTFOLIO-007: Manage Stock Tags

> Users can tag stocks in a portfolio, with support for viewing aggregated P&L by tag.

## Rules

| ID | Rule |
|----|------|
| R1 | Tags are defined within a single portfolio, freely created by users |
| R2 | A stock can be associated with multiple tags |
| R3 | When deleting a tag, automatically disassociate that tag from all stocks |
| R4 | When aggregating by tag, calculate total cost, market value, and P&L for all holdings under that tag |

## Scenarios

### api-test

| ID | Priority | Status | Scenario | Rules |
|----|----------|--------|----------|-------|
| UC-PORTFOLIO-007-S01 | P0 | ✅ | Given portfolio "US Stocks" exists, When creating tag "High Dividend", Then tag created successfully, tag list contains "High Dividend" | R1 |
| UC-PORTFOLIO-007-S02 | P0 | ✅ | Given portfolio has AAPL and TSLA, tag "High Dividend" exists, When tagging AAPL with "High Dividend", Then AAPL's tag list contains "High Dividend", TSLA has no tags |
| UC-PORTFOLIO-007-S03 | P0 | ✅ | Given AAPL already has "High Dividend" tag, When adding "Tech" tag to AAPL, Then AAPL has two tags | R2 |
| UC-PORTFOLIO-007-S05 | P1 | ✅ | Given tag "High Dividend" is associated with AAPL, When deleting "High Dividend" tag, Then tag is deleted, AAPL is no longer associated with that tag | R3 |
| UC-PORTFOLIO-007-S06 | P1 | ❌ | Given user is not logged in, When creating tag, Then return 401 unauthorized |
| UC-PORTFOLIO-007-S07 | P1 | ✅ | Given portfolio has tag "Tech" associated with stocks AAPL and NVDA, When listing tags with include_stocks=true, Then tag returns symbols ["AAPL", "NVDA"] |

### ai-e2e
(none)
