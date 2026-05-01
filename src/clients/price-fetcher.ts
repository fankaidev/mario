export interface PriceFetcher {
  fetchPrice(symbol: string): Promise<number | null>;
  fetchName(symbol: string): Promise<string | null>;
}
