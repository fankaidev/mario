import type { PriceFetcher } from "./price-fetcher";

export class YahooFinanceFetcher implements PriceFetcher {
  async fetchPrice(symbol: string): Promise<number | null> {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`,
      {
        headers: { "User-Agent": "Mozilla/5.0" },
      },
    );
    if (!res.ok) return null;

    const body = (await res.json()) as {
      chart?: {
        result?: Array<{
          meta?: { regularMarketPrice?: number };
        }>;
      };
    };

    const price = body.chart?.result?.[0]?.meta?.regularMarketPrice;
    if (typeof price === "number" && price > 0) return price;
    return null;
  }

  async fetchName(_symbol: string): Promise<string | null> {
    return null;
  }
}
