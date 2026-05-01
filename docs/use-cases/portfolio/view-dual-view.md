# UC-PORTFOLIO-009: View Portfolio with Dual-View

> Users can view portfolio holdings, snapshots, and return curves through a responsive tabbed interface with mobile-first design.

## Rules

| ID | Rule |
|----|------|
| R1 | Portfolio detail page shows a summary card with total investment, market value, P&L, and return rate |
| R2 | Holdings are displayed as a table on desktop and cards on mobile |
| R3 | Snapshots tab allows viewing, adding, and deleting portfolio snapshots |
| R4 | Return curve tab shows market value and return rate over time from snapshot data |
| R5 | Tabs include Holdings, Transactions, Snapshots, Return, and Summary |

## Scenarios

### e2e-test

| ID | Priority | Status | Scenario | Rules |
|----|----------|--------|----------|-------|
| UC-PORTFOLIO-009-S01 | P1 | ❌ | Given a portfolio with holdings and snapshots, When viewing portfolio detail, Then summary card shows key metrics and all tabs are accessible | R1, R5 |
| UC-PORTFOLIO-009-S02 | P1 | ❌ | Given snapshots exist for a portfolio, When viewing the Return tab, Then return curve chart displays market value and return rate over time | R4 |
| UC-PORTFOLIO-009-S03 | P1 | ❌ | Given a portfolio with no snapshots, When viewing the Return tab, Then a message indicates no data is available | R4 |

### ai-e2e
(none)
