export interface HealthResponse {
  status: "ok";
}

export interface MeResponse {
  data: {
    id: number;
    email: string;
  };
}

export interface Portfolio {
  id: number;
  user_id: number;
  name: string;
  currency: "USD" | "HKD" | "CNY";
  created_at: string;
  archived: number;
  cash_balance: number;
  deleted_at: string | null;
}

export interface CreatePortfolioRequest {
  name: string;
  currency: "USD" | "HKD" | "CNY";
}

export type TransactionType = "buy" | "sell" | "dividend" | "initial";

export interface Transaction {
  id: number;
  portfolio_id: number;
  symbol: string;
  type: TransactionType;
  quantity: number;
  price: number;
  fee: number;
  date: string;
  created_at: string;
  name: string | null;
  cash_balance?: number;
}

export type TransferType = "deposit" | "withdrawal";

export interface Transfer {
  id: number;
  portfolio_id: number;
  type: TransferType;
  amount: number;
  fee: number;
  date: string;
  note: string | null;
  created_at: string;
  cash_balance?: number;
}

export interface CreateTransferRequest {
  type: TransferType;
  amount: number;
  fee?: number;
  date: string;
  note?: string;
}

export interface Holding {
  symbol: string;
  name: string;
  quantity: number;
  cost: number;
  price: number | null;
  market_value: number | null;
  unrealized_pnl: number | null;
  unrealized_pnl_rate: number | null;
}

export interface CreateTransactionRequest {
  symbol: string;
  type: TransactionType;
  quantity: number;
  price: number;
  fee: number;
  date: string;
}

export interface Lot {
  id: number;
  transaction_id: number;
  portfolio_id: number;
  symbol: string;
  quantity: number;
  remaining_quantity: number;
  cost_basis: number;
  created_at: string;
}

export interface PortfolioSnapshot {
  id: number;
  portfolio_id: number;
  date: string;
  total_investment: number;
  market_value: number;
  cash_balance: number;
  note: string | null;
  created_at: string;
}

export interface CreatePortfolioSnapshotRequest {
  date: string;
  total_investment: number;
  market_value: number;
  cash_balance: number;
  note?: string;
}

export interface Tag {
  id: number;
  portfolio_id: number;
  name: string;
}

export interface TagWithStocks extends Tag {
  symbols: string[];
}

export interface LotDetail {
  id: number;
  date: string;
  buy_price: number;
  quantity: number;
  remaining_quantity: number;
  cost_basis: number;
  current_value: number | null;
  unrealized_pnl: number | null;
  unrealized_pnl_rate: number | null;
  status: "open" | "closed";
}

export interface HoldingLots {
  symbol: string;
  name: string;
  total_quantity: number;
  lots: LotDetail[];
}

export interface PortfolioSummary {
  total_investment: number;
  securities_value: number;
  cash_balance: number;
  portfolio_value: number;
  unrealized_pnl: number;
  realized_pnl: number;
  dividend_income: number;
  total_pnl: number;
  return_rate: number;
  cumulative_buy_fees: number;
  cumulative_sell_fees: number;
  cumulative_withholding_tax: number;
  cumulative_total_fees: number;
  price_updated_at: string | null;
}

export interface PriceHistoryItem {
  date: string;
  close: number;
}

export interface PriceHistoryResponse {
  symbol: string;
  prices: PriceHistoryItem[];
}

export type CashMovementType = "deposit" | "withdrawal" | "buy" | "sell" | "dividend" | "initial";

export interface CashMovement {
  id: number;
  date: string;
  type: CashMovementType;
  symbol: string | null;
  note: string | null;
  amount: number;
  cash_balance: number;
}

export interface CorporateAction {
  id: number;
  portfolio_id: number;
  symbol: string;
  type: "split" | "merge";
  ratio: number;
  effective_date: string;
  created_at: string;
}

export interface CreateTagRequest {
  name: string;
}
