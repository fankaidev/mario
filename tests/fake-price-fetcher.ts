import { PriceFetcher } from "../src/clients/price-fetcher";

export class FakePriceFetcher implements PriceFetcher {
  private prices: Map<string, number | null> = new Map();
  private failures: Set<string> = new Set();
  private names: Map<string, string> = new Map();

  setPrice(symbol: string, price: number | null) {
    this.prices.set(symbol, price);
  }

  setFailure(symbol: string) {
    this.failures.add(symbol);
  }

  setName(symbol: string, name: string) {
    this.names.set(symbol, name);
  }

  async fetchPrice(symbol: string): Promise<number | null> {
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
}
