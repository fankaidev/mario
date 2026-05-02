export interface PriceFetcher {
  fetchPrice(symbol: string): Promise<number | null>;
  fetchName(symbol: string): Promise<string | null>;
  fetchHistory?(
    symbol: string,
    startDate: string,
    endDate: string,
  ): Promise<Array<{ date: string; close: number }>>;
}
