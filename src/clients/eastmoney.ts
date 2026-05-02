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
    return null;
  }

  async fetchHistory(
    symbol: string,
    startDate: string,
    endDate: string,
  ): Promise<Array<{ date: string; close: number }>> {
    const history: Array<{ date: string; close: number }> = [];
    let pageIndex = 1;
    const pageSize = 100;
    const start = new Date(startDate);
    const end = new Date(endDate);

    while (true) {
      const res = await fetch(
        `https://api.fund.eastmoney.com/f10/lsjz?fundCode=${symbol}&pageIndex=${pageIndex}&pageSize=${pageSize}`,
        {
          headers: {
            Referer: "https://fund.eastmoney.com/",
            "User-Agent": "Mozilla/5.0",
          },
        },
      );
      if (!res.ok) break;

      const body = (await res.json()) as {
        Data?: { LSJZList?: Array<{ FSRQ?: string; DWJZ?: string }> };
      };

      const list = body.Data?.LSJZList;
      if (!list || list.length === 0) break;

      for (const item of list) {
        if (!item.FSRQ || !item.DWJZ) continue;
        const date = item.FSRQ;
        const close = parseFloat(item.DWJZ);
        if (isNaN(close) || close <= 0) continue;

        const itemDate = new Date(date);
        if (itemDate < start) return history; // Data is sorted DESC by date
        if (itemDate <= end) {
          history.push({ date, close });
        }
      }

      if (list.length < pageSize) break; // Last page
      pageIndex++;
    }

    return history;
  }
}
