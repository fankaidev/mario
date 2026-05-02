import type { PriceFetcher } from "./price-fetcher";
import { YahooFinanceFetcher } from "./yahoo-finance";

export class FetcherRouter implements PriceFetcher {
  private yahoo = new YahooFinanceFetcher();

  constructor(private finnhub: PriceFetcher) {}

  private isYahooSymbol(symbol: string): boolean {
    return symbol.endsWith(".HK") || symbol.endsWith(".SS") || symbol.endsWith(".SZ");
  }

  async fetchPrice(symbol: string): Promise<number | null> {
    if (this.isYahooSymbol(symbol)) {
      return this.yahoo.fetchPrice(symbol);
    }
    return this.finnhub.fetchPrice(symbol);
  }

  async fetchName(symbol: string): Promise<string | null> {
    if (this.isYahooSymbol(symbol)) {
      return this.yahoo.fetchName(symbol);
    }
    return this.finnhub.fetchName(symbol);
  }
}
