# UC-PORTFOLIO-002: Record Transactions

> Users record transactions in a portfolio, the system automatically updates holdings and cost basis based on transaction type.

## Rules

| ID | Rule |
|----|------|
| R1 | Buy transaction creates a new lot, recording remaining quantity (initially equals buy quantity) |
| R2 | Sell transaction consumes lots in FIFO order, returns error if insufficient quantity |
| R3 | On sell, consumed lot's remaining quantity decreases, lot is marked closed when remaining quantity reaches zero |
| R4 | Dividend transaction does not consume lots, only records as cash income |
| R5 | Multiple buys of the same stock within a portfolio maintain independent lots |
| R6 | Transaction date cannot be later than current date |
| R7 | `fee` field meaning varies by transaction type: buy=commission, sell=commission, dividend=withholding tax, initial=commission |
| R8 | Initial transaction creates a lot just like buy, recording quantity and cost basis for pre-existing holdings |

## Scenarios

### api-test

| ID | Priority | Status | Scenario | Rules |
|----|----------|--------|----------|-------|
| UC-PORTFOLIO-002-S01 | P0 | ✅ | Given portfolio "US Stocks" exists with no holdings, When buying 100 shares of AAPL @ 150 USD (fee 5), Then create 1 transaction and 1 lot (remaining quantity 100, cost 15005), holdings show 100 shares AAPL | R1 |
| UC-PORTFOLIO-002-S02 | P0 | ✅ | Given already holding AAPL (lot1: 100 shares @ 150), When buying another 50 shares AAPL @ 160 (fee 3), Then create 2nd lot (lot2: 50 shares @ 160, remaining quantity 50), holdings show 150 shares, total cost 23008 | R5 |
| UC-PORTFOLIO-002-S03 | P0 | ✅ | Given holding AAPL (lot1: 100 @ 150, lot2: 50 @ 160), When selling 80 shares AAPL @ 170 (fee 5), Then lot1 remaining quantity becomes 20 (consumed 80), lot2 unchanged, holdings show 70 shares | R2, R3 |
| UC-PORTFOLIO-002-S04 | P0 | ✅ | Given holding 70 shares AAPL (lot1 remaining 20, lot2 remaining 50), When selling 80 shares AAPL, Then return 400 error, holdings unchanged | R2 |
| UC-PORTFOLIO-002-S05 | P1 | ✅ | Given holding 70 shares AAPL (lot1 remaining 20 @ 150, lot2 remaining 50 @ 160), When selling 20 shares @ 170 (fee 5), Then lot1 remaining quantity becomes 0 (marked closed), lot2 unchanged, realized P&L 394 USD | R3 |
| UC-PORTFOLIO-002-S06 | P0 | ✅ | Given portfolio exists, When recording AAPL dividend 100 USD (withholding tax 30), Then create dividend transaction (fee=30), lots unaffected, net dividend income 70 USD | R4, R7 |
| UC-PORTFOLIO-002-S07 | P1 | ❌ | Given user is not logged in, When recording transaction, Then return 401 unauthorized |
| UC-PORTFOLIO-002-S08 | P1 | ❌ | Given portfolio belongs to another user, When attempting to record transaction in that portfolio, Then return 403 forbidden |
| UC-PORTFOLIO-002-S09 | P0 | ✅ | Given portfolio exists with no holdings, When recording initial holding of 800 shares 1810.HK @ 40 HKD, Then create 1 transaction and 1 lot (remaining quantity 800, cost basis 32000 + fee), holdings show 800 shares | R8 |

### ai-e2e
(none)
