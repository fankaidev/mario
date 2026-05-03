# UC-PORTFOLIO-006: Cash Transactions

> Users deposit and withdraw cash to track portfolio cash balance. Cash transfers are stored in a separate `transfers` table.

## Rules

| ID | Rule |
|----|------|
| R1 | Deposit increases portfolio cash balance |
| R2 | Withdrawal decreases portfolio cash balance |
| R3 | ~~Withdrawal cannot exceed current cash balance~~ REMOVED: negative balance allowed for withdrawals (same as buy transactions) |
| R4 | Buy transaction decreases cash balance; negative balance allowed (margin/unsettled) |
| R5 | Sell transaction increases cash balance |
| R6 | Dividend transaction increases cash balance |
| R7 | Deleting a transfer reverses its cash balance effect ~~; for deposit, deletion blocked if resulting balance would be negative~~ REMOVED: negative balance allowed |
| R8 | Transfers (deposit/withdrawal) are stored in the `transfers` table with amount, fee, date, and optional note |
| R9 | Cash balance reflects net result of all portfolio transfers and transactions |

## Scenarios

### api-test

| ID | Priority | Status | Scenario | Rules |
|----|----------|--------|----------|-------|
| UC-PORTFOLIO-006-S01 | P0 | ✅ | Given portfolio with cash_balance=0, When depositing 10000 USD, Then cash_balance becomes 10000 | R1 |
| UC-PORTFOLIO-006-S02 | P0 | ✅ | Given portfolio with cash_balance=10000, When withdrawing 3000 USD, Then cash_balance becomes 7000 | R2 |
| UC-PORTFOLIO-006-S03 | P0 | ❌ | ~~Given portfolio with cash_balance=1000, When attempting to withdraw 2000 USD, Then return 400 error "insufficient cash balance"~~ REMOVED: negative balance now allowed | ~~R3~~ |
| UC-PORTFOLIO-006-S04 | P0 | ✅ | Given portfolio with cash_balance=10000, When buying AAPL 10 shares @ 150 with fee 5, Then cash_balance becomes 8495 (10000 - 1505) | R4 |
| UC-PORTFOLIO-006-S05 | P0 | ✅ | Given portfolio with cash_balance=0 and AAPL holding 10 shares, When selling AAPL 5 shares @ 180 with fee 5, Then cash_balance becomes 895 (900 - 5) | R5 |
| UC-PORTFOLIO-006-S06 | P1 | ✅ | Given portfolio with cash_balance=0, When receiving AAPL dividend 25 USD with fee 2.5 (tax), Then cash_balance becomes 22.5 (25 - 2.5) | R6 |
| UC-PORTFOLIO-006-S07 | P0 | ✅ | Given portfolio with cash_balance=5000 from deposit, When deleting that deposit transaction, Then cash_balance returns to 0 | R7 |
| UC-PORTFOLIO-006-S08 | P0 | ✅ | Given portfolio with cash_balance=8495 after buy, When deleting that buy transaction, Then cash_balance returns to 10000 | R7 |
| UC-PORTFOLIO-006-S09 | P1 | ❌ | ~~Given deposit 10000 then withdrawal 6000 (balance=4000), When attempting to delete deposit, Then return 400 error "would result in negative cash balance"~~ REMOVED: negative balance now allowed | ~~R7, R3~~ |
| UC-PORTFOLIO-006-S10 | P1 | ✅ | Given portfolio with cash_balance=1000, When buying AAPL 10 shares @ 150 (cost=1500), Then cash_balance becomes -500 (margin allowed) | R4 |
| UC-PORTFOLIO-006-S11 | P1 | ✅ | Given deposit with fee=50, When depositing 10000 USD, Then cash_balance becomes 9950 | R1 |
| UC-PORTFOLIO-006-S12 | P1 | ✅ | Given withdrawal with fee=25, When withdrawing 1000 from balance=5000, Then cash_balance becomes 3975 | R2 |
| UC-PORTFOLIO-006-S13 | P1 | ✅ | Given portfolio with deposits, withdrawals, buys, sells, and dividends, When recalculating cash, Then cash_balance equals net of all transfers and transactions | R9 |

### ai-e2e

(none)
