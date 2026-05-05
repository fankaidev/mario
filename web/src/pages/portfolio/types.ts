export interface Tag {
  id: number;
  name: string;
  symbols?: string[];
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

export type Summary = import("../../../../shared/types/api").PortfolioSummary;

export interface Snapshot {
  id: number;
  date: string;
  total_investment: number;
  market_value: number;
  cash_balance: number;
  return_rate: number | null;
  note: string | null;
}

export interface CashTransfer {
  id: number;
  type: "deposit" | "withdrawal" | "initial" | "interest";
  amount: number;
  fee: number;
  date: string;
  note: string | null;
}

export interface Portfolio {
  id: number;
  name: string;
  currency: string;
}

export type TabName =
  | "holdings"
  | "transactions"
  | "cash_transfers"
  | "cash_balance"
  | "corporate_actions"
  | "summary"
  | "tags";

export type SortField =
  | "symbol"
  | "quantity"
  | "cost"
  | "price"
  | "marketValue"
  | "unrealizedPnl"
  | "unrealizedPnlRate"
  | "weight";

export type SortDirection = "asc" | "desc";

export interface SortState {
  field: SortField;
  direction: SortDirection;
}
