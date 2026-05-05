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
  note: string | null;
}

export interface Transfer {
  id: number;
  type: "deposit" | "withdrawal" | "initial";
  amount: number;
  fee: number;
  date: string;
  note: string | null;
  cash_balance?: number;
}

export interface Portfolio {
  id: number;
  name: string;
  currency: string;
}

export type TabName =
  | "holdings"
  | "transactions"
  | "transfers"
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
