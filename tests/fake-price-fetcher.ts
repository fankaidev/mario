import type { PriceFetcher } from "../src/clients/price-fetcher";

export class FakePriceFetcher implements PriceFetcher {
  private prices: Map<string, number | null> = new Map();
  private failures: Set<string> = new Set();
  private names: Map<string, string> = new Map();
  private history: Map<string, Array<{ date: string; close: number }>> = new Map();
  private accessedSymbols: string[] = [];

  setPrice(symbol: string, price: number | null) {
    this.prices.set(symbol, price);
  }

  setFailure(symbol: string) {
    this.failures.add(symbol);
  }

  setName(symbol: string, name: string) {
    this.names.set(symbol, name);
  }

  setHistory(symbol: string, entries: Array<{ date: string; close: number }>) {
    this.history.set(symbol, entries);
    if (entries.length > 0) {
      this.prices.set(symbol, entries[entries.length - 1].close);
    }
  }

  async fetchPrice(symbol: string): Promise<number | null> {
    this.accessedSymbols.push(symbol);
    if (this.failures.has(symbol)) {
      throw new Error(`Fetch failed for ${symbol}`);
    }
    const price = this.prices.get(symbol);
    return price ?? null;
  }

  async fetchName(symbol: string): Promise<string | null> {
    if (this.failures.has(symbol)) {
      throw new Error(`Fetch failed for ${symbol}`);
    }
    return this.names.get(symbol) ?? null;
  }

  async fetchHistory(
    symbol: string,
    startDate: string,
    endDate: string,
  ): Promise<Array<{ date: string; close: number }>> {
    this.accessedSymbols.push(symbol);
    const entries = this.history.get(symbol) ?? [];
    return entries.filter((e) => e.date >= startDate && e.date <= endDate);
  }

  getAccessedSymbols(): string[] {
    return this.accessedSymbols;
  }
}
