import { describe, expect, it } from "vitest";
import { FetcherRouter } from "../src/clients/fetcher-router";
import type { PriceFetcher } from "../src/clients/price-fetcher";

class TrackingFetcher implements PriceFetcher {
  public calls: string[] = [];

  constructor(private prefix: string) {}

  async fetchPrice(symbol: string): Promise<number | null> {
    this.calls.push(`${this.prefix}:price:${symbol}`);
    return 100;
  }

  async fetchName(symbol: string): Promise<string | null> {
    this.calls.push(`${this.prefix}:name:${symbol}`);
    return `${this.prefix} ${symbol}`;
  }
}

describe("FetcherRouter", () => {
  it("[UC-PORTFOLIO-005-S07] routes HK stocks to Yahoo Finance", async () => {
    const finnhub = new TrackingFetcher("finnhub");
    const yahoo = new TrackingFetcher("yahoo");
    const router = new FetcherRouter(finnhub, yahoo);

    await router.fetchPrice("0700.HK");
    expect(finnhub.calls).toEqual([]);
    expect(yahoo.calls).toEqual(["yahoo:price:0700.HK"]);
  });

  it("[UC-PORTFOLIO-005-S07] routes SS stocks to Yahoo Finance", async () => {
    const finnhub = new TrackingFetcher("finnhub");
    const yahoo = new TrackingFetcher("yahoo");
    const router = new FetcherRouter(finnhub, yahoo);

    await router.fetchPrice("600519.SS");
    expect(finnhub.calls).toEqual([]);
    expect(yahoo.calls).toEqual(["yahoo:price:600519.SS"]);
  });

  it("[UC-PORTFOLIO-005-S07] routes SZ stocks to Yahoo Finance", async () => {
    const finnhub = new TrackingFetcher("finnhub");
    const yahoo = new TrackingFetcher("yahoo");
    const router = new FetcherRouter(finnhub, yahoo);

    await router.fetchPrice("000858.SZ");
    expect(finnhub.calls).toEqual([]);
    expect(yahoo.calls).toEqual(["yahoo:price:000858.SZ"]);
  });

  it("[UC-PORTFOLIO-005-S08] routes US stocks to Finnhub", async () => {
    const finnhub = new TrackingFetcher("finnhub");
    const yahoo = new TrackingFetcher("yahoo");
    const router = new FetcherRouter(finnhub, yahoo);

    await router.fetchPrice("AAPL");
    expect(finnhub.calls).toEqual(["finnhub:price:AAPL"]);
    expect(yahoo.calls).toEqual([]);
  });

  it("[UC-PORTFOLIO-005-S08] routes name fetches correctly", async () => {
    const finnhub = new TrackingFetcher("finnhub");
    const yahoo = new TrackingFetcher("yahoo");
    const router = new FetcherRouter(finnhub, yahoo);

    await router.fetchName("AAPL");
    await router.fetchName("0700.HK");
    expect(finnhub.calls).toEqual(["finnhub:name:AAPL"]);
    expect(yahoo.calls).toEqual(["yahoo:name:0700.HK"]);
  });
});
