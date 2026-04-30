# Mario

Personal portfolio tracker for US, HK, and China A-share markets.

## Features

- Multi-portfolio management with single-currency isolation (USD/HKD/CNY)
- FIFO lot tracking for cost basis and realized P&L calculation
- Automatic price updates via Finnhub API
- Transaction history with dividend and fee tracking

## Stack

- **Backend**: Cloudflare Workers + Hono + D1 (SQLite)
- **Frontend**: React 19 + Vite + Tailwind CSS + TanStack Query
- **Auth**: Cloudflare Access + Google OAuth

## Core Concepts

### Portfolio

A container for holdings in a single currency. Each portfolio is isolated — no cross-currency conversions. You might have separate portfolios for US stocks (USD), HK stocks (HKD), and China A-shares (CNY).

### Transaction

A record of a buy, sell, or dividend event:

| Type | Effect |
|------|--------|
| **buy** | Creates a new lot with quantity and cost basis |
| **sell** | Consumes lots in FIFO order, records realized P&L |
| **dividend** | Records cash income (fee = withholding tax) |

### Lot

A lot represents shares acquired in a single buy transaction. It tracks:

- **quantity**: Original shares purchased
- **remaining_quantity**: Shares still held (decreases on sell)
- **cost_basis**: Total cost (quantity × price)
- **closed**: Whether all shares have been sold

When you sell, lots are consumed in **FIFO order** (oldest first). A single lot can be consumed by multiple sell transactions, and a single sell can consume multiple lots.

### Realized P&L

When a sell consumes a lot (partially or fully), a `realized_pnl` record is created:

```
realized_pnl:
  sell_transaction_id  →  The sell transaction
  lot_id               →  The consumed lot
  quantity             →  Shares sold from this lot
  proceeds             →  Sale amount (sell price × quantity)
  cost                 →  Cost basis for those shares
  pnl                  →  Profit/loss (proceeds - cost)
```

### Example

```
Buy 100 AAPL @ $150   →  Lot 1 (remaining: 100, cost: $15,000)
Buy 50 AAPL @ $160    →  Lot 2 (remaining: 50, cost: $8,000)

Sell 120 AAPL @ $170  →  Consumes:
                         - Lot 1: 100 shares, P&L = (170-150) × 100 = $2,000
                         - Lot 2: 20 shares, P&L = (170-160) × 20 = $200
                         Lot 1 closed, Lot 2 remaining: 30
```

### Relationship Summary

| Relationship | Cardinality |
|--------------|-------------|
| Portfolio → Transaction | 1:N |
| Buy Transaction → Lot | 1:1 |
| Lot → Sell Transaction | N:N (via realized_pnl) |
