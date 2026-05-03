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

## Scenarios

### e2e-test

| ID | Priority | Status | Scenario | Rules |
|----|----------|--------|----------|-------|
| UC-PORTFOLIO-010-S01 | P2 | ❌ | Given user has multiple portfolios with snapshots, When viewing the homepage, Then a stacked bar chart shows each portfolio's market value over time | R1, R2 |
| UC-PORTFOLIO-010-S02 | P2 | ❌ | Given user has multiple portfolios, When toggling a portfolio off in the selector, Then that portfolio's data is removed from the chart | R3 |
| UC-PORTFOLIO-010-S03 | P2 | ❌ | Given user has no portfolios, When viewing the homepage, Then no chart is displayed | R6 |
| UC-PORTFOLIO-010-S04 | P2 | ❌ | Given user has portfolios but no snapshots, When viewing the homepage, Then no chart is displayed | R6 |

### ai-e2e
(none)
