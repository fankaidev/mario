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

  async fetchHistory(
    symbol: string,
    startDate: string,
    endDate: string,
  ): Promise<Array<{ date: string; close: number }>> {
    const period1 = Math.floor(new Date(startDate).getTime() / 1000);
    const period2 = Math.floor(new Date(endDate).getTime() / 1000);

    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&period1=${period1}&period2=${period2}`,
      {
        headers: { "User-Agent": "Mozilla/5.0" },
      },
    );
    if (!res.ok) return [];

    const body = (await res.json()) as {
      chart?: {
        result?: Array<{
          timestamp?: number[];
          indicators?: {
            quote?: Array<{
              close?: number[];
            }>;
          };
        }>;
      };
    };

    const result = body.chart?.result?.[0];
    if (!result?.timestamp || !result?.indicators?.quote?.[0]?.close) return [];

    const closes = result.indicators.quote[0].close;
    const history: Array<{ date: string; close: number }> = [];

    for (let i = 0; i < result.timestamp.length; i++) {
      const close = closes[i];
      const ts = result.timestamp[i];
      if (typeof close === "number" && close > 0 && ts !== undefined) {
        const date = new Date(ts * 1000).toISOString().split("T")[0]!;
        history.push({ date, close });
      }
    }

    return history;
  }
}
