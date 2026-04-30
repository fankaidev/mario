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
