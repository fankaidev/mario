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

## API Usage

The Mario API can be accessed programmatically for automation, scripting, and integration with other tools.

### Authentication

Mario supports two authentication methods:

1. **Cloudflare Access JWT** (for web UI)
   - Automatically provided via `CF_Authorization` cookie or `Cf-Access-Jwt-Assertion` header
   - Used when accessing the app through the browser

2. **API Tokens** (for programmatic access)
   - Generate tokens in the app UI (Settings → API Tokens)
   - Use in `Authorization: Bearer <token>` header
   - Suitable for scripts, CLI tools, and external services

### Common Operations

#### Sync Price History

Fetch historical daily close prices for held stocks:

```bash
curl -X POST https://your-app.workers.dev/api/prices/sync \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "start_date": "2024-01-01"
  }'
```

**Response:**
```json
{
  "data": {
    "total_records": 150,
    "results": [
      { "symbol": "AAPL", "records": 50 },
      { "symbol": "TSLA", "records": 50 },
      { "symbol": "0700.HK", "records": 50 }
    ]
  }
}
```

**Options:**
- `start_date` (optional): Start date for historical sync (default: `2026-01-01`)
- `symbol` (optional): Sync specific symbol only (default: all held symbols)

The sync endpoint automatically:
- Fetches only missing dates (from last known date + 1)
- Returns 0 records if already up-to-date
- Uses appropriate data source per symbol (Yahoo Finance for HK/CN/US, Eastmoney for CN mutual funds)

#### List Portfolios

```bash
curl https://your-app.workers.dev/api/portfolios \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### Delete Portfolio (Soft Delete)

```bash
curl -X DELETE https://your-app.workers.dev/api/portfolios/{id} \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Marks portfolio as deleted (sets `deleted_at` timestamp). All data is preserved and can be restored.

#### Restore Portfolio

```bash
curl -X POST https://your-app.workers.dev/api/portfolios/{id}/restore \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Restores a soft-deleted portfolio (clears `deleted_at`).

#### Get Portfolio Summary

```bash
curl https://your-app.workers.dev/api/portfolios/{id}/summary \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### Get Holdings

```bash
curl https://your-app.workers.dev/api/portfolios/{id}/holdings \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### List Transactions

```bash
# List all transactions
curl https://your-app.workers.dev/api/portfolios/{id}/transactions \
  -H "Authorization: Bearer YOUR_TOKEN"

# Filter by date range
curl "https://your-app.workers.dev/api/portfolios/{id}/transactions?startDate=2024-01-01&endDate=2024-12-31" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Query parameters:**
- `startDate` - Filter transactions from this date (YYYY-MM-DD)
- `endDate` - Filter transactions up to this date (YYYY-MM-DD)

#### Add Transaction

```bash
curl -X POST https://your-app.workers.dev/api/portfolios/{id}/transactions \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "AAPL",
    "type": "buy",
    "quantity": 100,
    "price": 150.50,
    "fee": 1.00,
    "date": "2024-01-15"
  }'
```

#### Create Snapshot

Create a historical snapshot of portfolio state for performance tracking:

```bash
curl -X POST https://your-app.workers.dev/api/portfolios/{id}/snapshots \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2024-01-01"
  }'
```

Snapshots capture portfolio value, holdings, and P&L at a specific point in time. Used for tracking portfolio performance over time.

### Response Format

All API responses follow a consistent envelope:

**Success:**
```json
{
  "data": { ... }
}
```

**Error:**
```json
{
  "error": "Error message"
}
```

### Base URL

All endpoints are prefixed with `/api`:
- Health check: `GET /api/health`
- Portfolios: `GET /api/portfolios`
- Portfolio summary: `GET /api/portfolios/:id/summary`
- Holdings: `GET /api/portfolios/:id/holdings`
- Transactions: `GET /api/portfolios/:id/transactions`
- Add transaction: `POST /api/portfolios/:id/transactions`
- Create snapshot: `POST /api/portfolios/:id/snapshots`
- Price sync: `POST /api/prices/sync`
