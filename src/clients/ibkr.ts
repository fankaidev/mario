export interface IbkrTrade {
  symbol: string;
  buySell: "BUY" | "SELL";
  quantity: number;
  tradePrice: number;
  tradeDate: string;
  ibCommission: number;
  currency: string;
  assetCategory: string;
  exchange: string;
  transactionId: string;
}

export interface IbkrCashTransaction {
  type: string;
  dateTime: string;
  amount: number;
  currency: string;
  symbol: string;
  description: string;
}

export interface IbkrFlexStatement {
  trades: IbkrTrade[];
  cashTransactions: IbkrCashTransaction[];
}

export interface IbkrFlexClient {
  fetchStatement(token: string, queryId: string): Promise<IbkrFlexStatement>;
}

export class IbkrFlexHttpClient implements IbkrFlexClient {
  private baseUrl = "https://gdcdyn.interactivebrokers.com/Universal/servlet/FlexStatementService";
  private maxRetries = 10;
  private retryDelay = 3000;

  async fetchStatement(token: string, queryId: string): Promise<IbkrFlexStatement> {
    // Step 1: Send request
    const sendUrl = `${this.baseUrl}.SendRequest?t=${encodeURIComponent(token)}&q=${encodeURIComponent(queryId)}&v=3`;
    const sendRes = await fetch(sendUrl);
    if (!sendRes.ok) throw new Error(`IBKR SendRequest failed: ${sendRes.status}`);

    const sendXml = await sendRes.text();
    const statusMatch = sendXml.match(/<Status>([^<]+)<\/Status>/);
    if (statusMatch?.[1] !== "Success") {
      const errorMsg =
        sendXml.match(/<ErrorMessage>([^<]+)<\/ErrorMessage>/)?.[1] ?? "Unknown error";
      throw new Error(`IBKR SendRequest failed: ${errorMsg}`);
    }

    const referenceCode = sendXml.match(/<ReferenceCode>([^<]+)<\/ReferenceCode>/)?.[1];
    if (!referenceCode) throw new Error("IBKR SendRequest: no ReferenceCode returned");

    // Step 2: Poll for statement
    const getUrl = `${this.baseUrl}.GetStatement?t=${encodeURIComponent(token)}&q=${encodeURIComponent(referenceCode)}&v=3`;

    for (let i = 0; i < this.maxRetries; i++) {
      await this.sleep(this.retryDelay);

      const getRes = await fetch(getUrl);
      if (!getRes.ok) throw new Error(`IBKR GetStatement failed: ${getRes.status}`);

      const xml = await getRes.text();

      // Check if still generating
      if (xml.includes("<ErrorCode>1019</ErrorCode>")) continue;
      if (xml.includes("<Status>Fail</Status>")) {
        const errorMsg = xml.match(/<ErrorMessage>([^<]+)<\/ErrorMessage>/)?.[1] ?? "Unknown error";
        throw new Error(`IBKR GetStatement failed: ${errorMsg}`);
      }

      return parseFlexStatement(xml);
    }

    throw new Error("IBKR GetStatement: max retries exceeded");
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export function parseFlexStatement(xml: string): IbkrFlexStatement {
  const trades: IbkrTrade[] = [];
  const cashTransactions: IbkrCashTransaction[] = [];

  // Parse Trade elements
  const tradeRegex = /<Trade\s+([^>]+)\/>/g;
  let match: RegExpExecArray | null;
  while ((match = tradeRegex.exec(xml)) !== null) {
    const attrs = parseAttributes(match[1]!);
    if (attrs["symbol"] && attrs["buySell"] && attrs["tradeDate"]) {
      trades.push({
        symbol: attrs["symbol"],
        buySell: attrs["buySell"] as "BUY" | "SELL",
        quantity: Math.abs(parseFloat(attrs["quantity"] ?? "0")),
        tradePrice: parseFloat(attrs["tradePrice"] ?? "0"),
        tradeDate: attrs["tradeDate"],
        ibCommission: Math.abs(parseFloat(attrs["ibCommission"] ?? "0")),
        currency: attrs["currency"] ?? "USD",
        assetCategory: attrs["assetCategory"] ?? "STK",
        exchange: attrs["exchange"] ?? "",
        transactionId: attrs["transactionID"] ?? "",
      });
    }
  }

  // Parse CashTransaction elements
  const cashRegex = /<CashTransaction\s+([^>]+)\/>/g;
  while ((match = cashRegex.exec(xml)) !== null) {
    const attrs = parseAttributes(match[1]!);
    if (attrs["type"] && attrs["dateTime"] && attrs["amount"]) {
      cashTransactions.push({
        type: attrs["type"],
        dateTime: attrs["dateTime"].split(";")[0]!,
        amount: parseFloat(attrs["amount"]),
        currency: attrs["currency"] ?? "USD",
        symbol: attrs["symbol"] ?? "",
        description: attrs["description"] ?? "",
      });
    }
  }

  return { trades, cashTransactions };
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function parseAttributes(attrString: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const regex = /(\w+)="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(attrString)) !== null) {
    attrs[m[1]!] = decodeXmlEntities(m[2]!);
  }
  return attrs;
}

export function mapIbkrSymbol(symbol: string, exchange: string): string {
  // HK stocks: numeric symbol on SEHK → pad to 4 digits + .HK
  if (exchange === "SEHK" || /^\d{1,4}$/.test(symbol)) {
    return symbol.padStart(4, "0") + ".HK";
  }
  // US stocks: direct use
  return symbol;
}
