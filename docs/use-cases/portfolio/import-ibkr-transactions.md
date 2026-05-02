# UC-IMPORT-001: Import Transactions from IBKR Flex Query

> Users can import trades, dividends, and transfers from Interactive Brokers using the Flex Query API.

## Rules

| ID | Rule |
|----|------|
| R1 | Import requires a valid IBKR Flex Web Service token and query ID |
| R2 | Trades are mapped to buy/sell transactions; CashTransactions are mapped to dividends or transfers |
| R3 | Withholding tax on dividends is merged into the dividend transaction's fee field |
| R4 | Deposits & Withdrawals cash transactions are mapped to deposit/withdrawal transfers |
| R5 | Duplicate transactions (same date, symbol, type, quantity, price) are skipped |
| R6 | HK stock symbols from IBKR (e.g., "700" on SEHK) are mapped to Yahoo Finance format (e.g., "0700.HK") |
| R7 | API errors (invalid token, network failure) return 502 with error message |
| R8 | Individual transaction import failures are recorded in errors array but don't stop the import |

## Scenarios

### api-test

| ID | Priority | Status | Scenario | Rules |
|----|----------|--------|----------|-------|
| UC-IMPORT-001-S01 | P0 | ✅ | Given IBKR statement with buy trades, When importing, Then buy transactions and lots are created with correct symbol, quantity, price, fee | R2 |
| UC-IMPORT-001-S02 | P0 | ✅ | Given IBKR statement with deposit cash transactions, When importing, Then deposit transfers are created | R4 |
| UC-IMPORT-001-S03 | P0 | ✅ | Given IBKR statement with dividends and withholding tax, When importing, Then dividend transactions are created with tax merged as fee | R3 |
| UC-IMPORT-001-S04 | P0 | ✅ | Given existing transaction matches IBKR trade, When importing, Then duplicate is skipped, count recorded | R5 |
| UC-IMPORT-001-S05 | P1 | ✅ | Given user is not authenticated, When calling import endpoint, Then return 401 | |
| UC-IMPORT-001-S06 | P0 | ✅ | Given IBKR trade on SEHK exchange, When importing, Then symbol is mapped to Yahoo Finance format with .HK suffix | R6 |
| UC-IMPORT-001-S07 | P1 | ✅ | Given IBKR API returns error, When importing, Then error is returned to caller | R7 |

### ai-e2e
(none)
