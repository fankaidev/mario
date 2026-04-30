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
}

export interface CreatePortfolioRequest {
  name: string;
  currency: "USD" | "HKD" | "CNY";
}

export type TransactionType = "buy" | "sell" | "dividend";

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
  closed: number;
  created_at: string;
}
