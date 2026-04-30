export interface PriceFetcher {
  fetchPrice(symbol: string): Promise<number | null>;
}
