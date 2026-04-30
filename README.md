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
