import type { PriceFetcher } from "./price-fetcher";

export class EastmoneyFetcher implements PriceFetcher {
  async fetchPrice(symbol: string): Promise<number | null> {
    const res = await fetch(
      `https://api.fund.eastmoney.com/f10/lsjz?fundCode=${symbol}&pageIndex=1&pageSize=1`,
      {
        headers: {
          Referer: "https://fund.eastmoney.com/",
          "User-Agent": "Mozilla/5.0",
        },
      },
    );
    if (!res.ok) return null;
    const body = (await res.json()) as {
      Data?: { LSJZList?: Array<{ DWJZ?: string }> };
    };
    const nav = body.Data?.LSJZList?.[0]?.DWJZ;
    if (typeof nav === "string") {
      const price = parseFloat(nav);
      if (!isNaN(price) && price > 0) return price;
    }
    return null;
  }

  async fetchName(_symbol: string): Promise<string | null> {
    // Eastmoney API doesn't provide fund name in the lsjz endpoint
    return null;
  }
}
