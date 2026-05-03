# UC-PORTFOLIO-009: View Portfolio with Dual-View

> Users can view portfolio holdings, return charts, and snapshots through a responsive tabbed interface with mobile-first design.

## Rules

| ID | Rule |
|----|------|
| R1 | Portfolio detail page shows a summary card with total investment, market value, P&L, and return rate |
| R2 | Holdings are displayed as a table on desktop and cards on mobile |
| R3 | Summary tab allows viewing charts, fee overview, and managing portfolio snapshots (add, delete) |
| R4 | Summary tab shows market value over time and return rate over time charts from snapshot data |
| R5 | Tabs include Holdings, Transactions, and Summary |
| R6 | Return charts support time range filtering: 1M, 3M, 6M, 1Y, All |

## Scenarios

### e2e-test

| ID | Priority | Status | Scenario | Rules |
|----|----------|--------|----------|-------|
| UC-PORTFOLIO-009-S01 | P1 | ❌ | Given a portfolio with holdings and snapshots, When viewing portfolio detail, Then summary card shows key metrics and Holdings/Transactions/Summary tabs are accessible | R1, R5 |
| UC-PORTFOLIO-009-S02 | P1 | ❌ | Given snapshots exist for a portfolio, When viewing the Summary tab, Then market value and return rate charts display data over time for the selected range | R4 |
| UC-PORTFOLIO-009-S03 | P1 | ❌ | Given a portfolio with no snapshots, When viewing the Summary tab, Then a message indicates no data is available | R4 |
| UC-PORTFOLIO-009-S04 | P1 | ❌ | Given a portfolio with snapshots spanning multiple years, When selecting a time range filter (e.g. 1M, 3M, 6M, 1Y, All), Then charts show only data points within the selected range | R6 |

### ai-e2e
(none)
