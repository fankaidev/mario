export interface HealthResponse {
  status: "ok";
}

export interface Portfolio {
  id: number;
  user_id: number;
  name: string;
  currency: "USD" | "HKD" | "CNY";
  created_at: string;
  archived: number;
  cash_balance: number;
}

export interface CreatePortfolioRequest {
  name: string;
  currency: "USD" | "HKD" | "CNY";
}

export type TransactionType = "buy" | "sell" | "dividend" | "initial" | "deposit" | "withdrawal";

export interface Transaction {
  id: number;
  portfolio_id: number;
  symbol: string | null;
  type: TransactionType;
  quantity: number | null;
  price: number;
  fee: number;
  date: string;
  created_at: string;
  name: string | null;
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
  symbol?: string;
  type: TransactionType;
  quantity?: number;
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
  closed: number;
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

export interface CreateTagRequest {
  name: string;
}
