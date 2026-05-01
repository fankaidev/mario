# UC-PORTFOLIO-006: View Portfolio Summary

> Users view overall asset status of a portfolio, including total market value, total investment, cumulative P&L, fee statistics and other key metrics.

## Rules

| ID | Rule |
|----|------|
| R1 | Total investment = sum of deposit amounts - sum of withdrawal amounts (net capital injected into portfolio) |
| R2 | Total market value = sum of (remaining quantity × latest stock price) for all unclosed lots |
| R3 | Cumulative realized P&L = sum of realized P&L for all sell transactions (sell proceeds - consumed lots cost - sell fee) |
| R4 | Total P&L = unrealized P&L + cumulative realized P&L + net dividend income |
| R5 | Total return rate = total P&L / total investment × 100% |
| R6 | When no holdings and no historical sells, cumulative realized P&L is 0, total P&L is 0 |
| R7 | Cumulative buy fees = sum of fees for all buy transactions |
| R8 | Cumulative sell fees = sum of fees for all sell transactions |
| R9 | Cumulative withholding tax = sum of fees for all dividend transactions |
| R10 | Total cumulative fees = cumulative buy fees + cumulative sell fees + cumulative withholding tax |

## Scenarios

### api-test

| ID | Priority | Status | Scenario | Rules |
|----|----------|--------|----------|-------|
| UC-PORTFOLIO-006-S01 | P0 | ✅ | Given portfolio with 20000 deposited, holds AAPL (cost 15005, market value 18000) and TSLA (cost 5003, market value 4500), no historical sells, When viewing portfolio summary, Then return total investment 20000, total market value 22500, unrealized P&L ~2492, return rate ~12.5% | R1, R2, R4, R5 |
| UC-PORTFOLIO-006-S02 | P0 | ✅ | Given portfolio holds AAPL (unrealized P&L 1600), and previously sold MSFT with realized P&L 800, When viewing portfolio summary, Then total P&L = 2400 | R4 |
| UC-PORTFOLIO-006-S03 | P0 | ✅ | Given portfolio has AAPL dividend 100 (withholding tax 30) and TSLA dividend 50 (withholding tax 10), When viewing portfolio summary, Then cumulative withholding tax 40, net dividend income 110, total P&L includes net dividend income | R4, R9 |
| UC-PORTFOLIO-006-S05 | P1 | ✅ | Given portfolio has no transaction records, When viewing portfolio summary, Then all metrics return 0 | R6 |
| UC-PORTFOLIO-006-S06 | P0 | ✅ | Given portfolio with deposits 50000 and 20000, and withdrawal 10000, When viewing portfolio summary, Then total investment = 60000 (net deposits - withdrawals) | R1 |
| UC-PORTFOLIO-006-S07 | P1 | ❌ | Given portfolio has holdings but some stocks have no latest price, When viewing portfolio summary, Then total market value and P&L calculated based on stocks with prices, stocks missing prices excluded from calculation and flagged |
| UC-PORTFOLIO-006-S08 | P1 | ❌ | Given user is not logged in, When viewing portfolio summary, Then return 401 unauthorized |

### ai-e2e
(none)
