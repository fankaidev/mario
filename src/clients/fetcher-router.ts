import type { PriceFetcher } from "./price-fetcher";
import { YahooFinanceFetcher } from "./yahoo-finance";
import { EastmoneyFetcher } from "./eastmoney";

export class FetcherRouter implements PriceFetcher {
  constructor(
    private finnhub: PriceFetcher,
    private yahoo: PriceFetcher = new YahooFinanceFetcher(),
    private eastmoney: PriceFetcher = new EastmoneyFetcher(),
  ) {}

  private isYahooSymbol(symbol: string): boolean {
    return symbol.endsWith(".HK") || symbol.endsWith(".SS") || symbol.endsWith(".SZ");
  }

  private isEastmoneySymbol(symbol: string): boolean {
    return /^\d{6}$/.test(symbol);
  }

  async fetchPrice(symbol: string): Promise<number | null> {
    if (this.isEastmoneySymbol(symbol)) {
      return this.eastmoney.fetchPrice(symbol);
    }
    if (this.isYahooSymbol(symbol)) {
      return this.yahoo.fetchPrice(symbol);
    }
    return this.finnhub.fetchPrice(symbol);
  }

  async fetchName(symbol: string): Promise<string | null> {
    if (this.isEastmoneySymbol(symbol)) {
      return this.eastmoney.fetchName(symbol);
    }
    if (this.isYahooSymbol(symbol)) {
      return this.yahoo.fetchName(symbol);
    }
    return this.finnhub.fetchName(symbol);
  }

  async fetchHistory(
    symbol: string,
    startDate: string,
    endDate: string,
  ): Promise<Array<{ date: string; close: number }>> {
    if (this.isEastmoneySymbol(symbol)) {
      return this.eastmoney.fetchHistory?.(symbol, startDate, endDate) ?? [];
    }
    // Yahoo Finance for US stocks and HK/SS/SZ
    return this.yahoo.fetchHistory?.(symbol, startDate, endDate) ?? [];
  }
}
