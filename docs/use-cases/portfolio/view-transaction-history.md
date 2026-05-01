# UC-PORTFOLIO-004: View Transaction History

> Users view all transaction records in a portfolio timeline, with export support.

## Rules

| ID | Rule |
|----|------|
| R1 | Transaction history sorted by transaction date descending, same date by creation time descending |
| R2 | When deleting a transaction, synchronously rollback lot changes caused by that transaction (buy deletion removes corresponding lot; sell deletion restores consumed lot remaining quantities) |
| R3 | Transaction records cannot be edited, only deleted and re-entered |
| R4 | Export API returns complete transaction list in JSON format, including all fields |
| R5 | Transaction history can be filtered by symbol to show only transactions for a specific stock |

## Scenarios

### api-test

| ID | Priority | Status | Scenario | Rules |
|----|----------|--------|----------|-------|
| UC-PORTFOLIO-004-S01 | P0 | ✅ | Given portfolio "US Stocks" has 3 transaction records (dates 2024-01-15, 2024-02-20, 2024-03-10), When viewing transaction history, Then return in order 3/10, 2/20, 1/15 | R1 |
| UC-PORTFOLIO-004-S02 | P0 | ✅ | Given portfolio has AAPL buy transaction (lot1 remaining 100), When deleting that transaction, Then corresponding lot1 is deleted, holdings become empty | R2 |
| UC-PORTFOLIO-004-S03 | P0 | ✅ | Given portfolio has AAPL buy (lot1: 100 @ 150) and subsequent sell (consumed 50), When deleting sell transaction, Then lot1 remaining quantity restores to 100 | R2 |
| UC-PORTFOLIO-004-S04 | P1 | ✅ | Given portfolio has no transaction records, When viewing transaction history, Then return empty array |
| UC-PORTFOLIO-004-S05 | P1 | ❌ | Given portfolio has multiple transaction records, When calling export API, Then return JSON array containing all transaction fields | R4 |
| UC-PORTFOLIO-004-S06 | P1 | ❌ | Given user is not logged in, When viewing transaction history, Then return 401 unauthorized |
| UC-PORTFOLIO-004-S07 | P1 | ✅ | Given portfolio has AAPL (buy, sell, dividend) and TSLA (buy) transactions, When viewing transactions filtered by symbol=AAPL, Then return only AAPL transactions in date descending order | R5 |

### ai-e2e
(none)
