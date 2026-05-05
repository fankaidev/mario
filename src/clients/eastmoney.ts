import type { PriceFetcher } from "./price-fetcher";

export class EastmoneyFetcher implements PriceFetcher {
  private symbolToSecid(symbol: string): string | null {
    if (/^\d{6}$/.test(symbol)) return null; // Fund code, use fund API
    if (symbol.endsWith(".SZ")) return "0." + symbol.slice(0, -3);
    if (symbol.endsWith(".SS")) return "1." + symbol.slice(0, -3);
    if (symbol.endsWith(".HK")) return "116." + symbol.slice(0, -3).padStart(5, "0");
    return null; // Not a CN/HK symbol
  }

  async fetchPrice(symbol: string): Promise<number | null> {
    const secid = this.symbolToSecid(symbol);

    // Stock (CN/HK)
    if (secid) {
      const res = await fetch(
        `https://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=f43`,
        {
          headers: {
            Referer: "https://www.eastmoney.com/",
            "User-Agent": "Mozilla/5.0",
          },
        },
      );
      if (!res.ok) return null;
      const body = (await res.json()) as {
        data?: { f43?: number };
      };
      const price = body.data?.f43;
      if (typeof price === "number" && price >= 0) {
        // HK stocks are in cents, divide by 100
        return symbol.endsWith(".HK") ? price / 100 : price;
      }
      return null;
    }

    // Fund (6-digit code)
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
      if (!isNaN(price) && price >= 0) return price;
    }
    return null;
  }

  async fetchName(symbol: string): Promise<string | null> {
    const secid = this.symbolToSecid(symbol);

    // Stock (CN/HK)
    if (secid) {
      const res = await fetch(
        `https://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=f58`,
        {
          headers: {
            Referer: "https://www.eastmoney.com/",
            "User-Agent": "Mozilla/5.0",
          },
        },
      );
      if (!res.ok) return null;
      const body = (await res.json()) as {
        data?: { f58?: string };
      };
      return body.data?.f58 ?? null;
    }

    // Fund (6-digit code)
    const res = await fetch(`https://fund.eastmoney.com/pingzhongdata/${symbol}.js`, {
      headers: {
        Referer: "https://fund.eastmoney.com/",
        "User-Agent": "Mozilla/5.0",
      },
    });
    if (!res.ok) return null;

    const text = await res.text();
    const match = text.match(/var fS_name = "([^"]*)"/);
    return match?.[1] ?? null;
  }

  async fetchHistory(
    symbol: string,
    startDate: string,
    endDate: string,
  ): Promise<Array<{ date: string; close: number }>> {
    const secid = this.symbolToSecid(symbol);

    // Stock (CN/HK)
    if (secid) {
      const beg = startDate.replace(/-/g, "");
      const end = endDate.replace(/-/g, "");
      const res = await fetch(
        `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&fields1=f1&fields2=f51,f52,f53&klt=101&fqt=1&beg=${beg}&end=${end}`,
        {
          headers: {
            Referer: "https://www.eastmoney.com/",
            "User-Agent": "Mozilla/5.0",
          },
        },
      );
      if (!res.ok) return [];

      const body = (await res.json()) as {
        data?: {
          klines?: string[];
        };
      };

      const klines = body.data?.klines;
      if (!klines || klines.length === 0) return [];

      const history: Array<{ date: string; close: number }> = [];
      for (const line of klines) {
        const parts = line.split(",");
        if (parts.length < 3) continue;
        const date = parts[0];
        const closeStr = parts[2];
        if (!date || !closeStr) continue;
        const close = parseFloat(closeStr);
        if (isNaN(close) || close < 0) continue;
        history.push({ date, close });
      }

      return history;
    }

    // Fund (6-digit code)
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
        if (isNaN(close) || close < 0) continue;

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
