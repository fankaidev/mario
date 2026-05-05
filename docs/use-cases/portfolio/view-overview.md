# UC-PORTFOLIO-010: View Multi-Portfolio Asset Overview

> Users can view total assets across multiple portfolios over time via a stacked bar chart on the homepage.

## Rules

| ID | Rule |
|----|------|
| R1 | Homepage shows a stacked bar chart aggregating market values from selected portfolios |
| R2 | Each bar represents a snapshot date; each segment represents one portfolio's market value |
| R3 | Portfolio selector allows toggling which portfolios are included in the chart |
| R4 | All non-deleted portfolios are selected by default |
| R5 | Portfolio colors are assigned consistently so the same portfolio always has the same color |
| R6 | Chart is hidden when no portfolios exist or no snapshots available |
| R7 | Currency selector (USD/HKD/CNY) allows choosing the display currency for aggregated values, defaults to USD |
| R8 | Aggregated summary card shows total portfolio value, total investment, total P&L, and return rate in the selected currency |
| R9 | Aggregated summary card is hidden when no portfolios exist |
| R10 | Each portfolio row shows its native portfolio value, and the converted value in the selected currency when different |
| R11 | When exchange rates are not yet available for a portfolio's currency, a note indicates rates are being synced |
| R12 | Chart snapshot values are converted to the selected display currency using the exchange rate at or before the snapshot date |
| R13 | Chart X-axis labels show year-prefixed dates (YY-MM-DD) without forcing the last label |

## Scenarios

### e2e-test

| ID | Priority | Status | Scenario | Rules |
|----|----------|--------|----------|-------|
| UC-PORTFOLIO-010-S01 | P2 | ❌ | Given user has multiple portfolios with snapshots, When viewing the homepage, Then a stacked bar chart shows each portfolio's market value over time | R1, R2 |
| UC-PORTFOLIO-010-S02 | P2 | ❌ | Given user has multiple portfolios, When toggling a portfolio off in the selector, Then that portfolio's data is removed from the chart | R3 |
| UC-PORTFOLIO-010-S03 | P2 | ❌ | Given user has no portfolios, When viewing the homepage, Then no chart or aggregated summary is displayed | R6, R9 |
| UC-PORTFOLIO-010-S04 | P2 | ❌ | Given user has portfolios but no snapshots, When viewing the homepage, Then no chart is displayed but aggregated summary card is shown | R6, R8 |
| UC-PORTFOLIO-010-S05 | P2 | ❌ | Given user changes display currency to HKD, When viewing homepage, Then aggregated summary and portfolio card values update to HKD | R7, R8, R10 |
| UC-PORTFOLIO-010-S06 | P2 | ❌ | Given user has HKD portfolio with no exchange rates, When viewing homepage in USD, Then a note indicates exchange rates are not yet available | R11 |

### ai-e2e
(none)
