import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPlatformProxy, unstable_dev } from "wrangler";
import type { UnstableDevWorker } from "wrangler";
import { cleanDatabase } from "./helpers";
import { FakeIbkrFlexClient } from "./fake-ibkr-client";
import { importIbkrStatement } from "../src/routes/import";
import { parseFlexStatement, mapIbkrSymbol } from "../src/clients/ibkr";

let worker: UnstableDevWorker;
let db: D1Database;
let portfolioId: number;

beforeAll(async () => {
  const { env } = await getPlatformProxy<{ DB: D1Database }>();
  db = env.DB;
  worker = await unstable_dev("src/index.ts", {
    config: "wrangler.toml",
    local: true,
  });
});

afterAll(async () => {
  await worker.stop();
});

beforeEach(async () => {
  await cleanDatabase(db);

  const userResult = await db
    .prepare("INSERT INTO users (email) VALUES (?) RETURNING id")
    .bind("test@example.com")
    .first<{ id: number }>();
  const userId = userResult!.id;

  const portfolioResult = await db
    .prepare("INSERT INTO portfolios (user_id, name, currency) VALUES (?, ?, ?) RETURNING id")
    .bind(userId, "US Stocks", "USD")
    .first<{ id: number }>();
  portfolioId = portfolioResult!.id;
});

describe("IBKR Symbol Mapping", () => {
  it("maps US stock symbols directly", () => {
    expect(mapIbkrSymbol("AAPL", "SMART")).toBe("AAPL");
  });

  it("maps HK stock symbols with padding and .HK suffix", () => {
    expect(mapIbkrSymbol("700", "SEHK")).toBe("0700.HK");
    expect(mapIbkrSymbol("9988", "SEHK")).toBe("9988.HK");
  });

  it("maps numeric symbols to .HK format", () => {
    expect(mapIbkrSymbol("700", "")).toBe("0700.HK");
  });
});

describe("IBKR XML Parsing", () => {
  it("parses trades from XML", () => {
    const xml = `<FlexQueryResponse>
      <FlexStatements>
        <FlexStatement>
          <Trades>
            <Trade symbol="AAPL" buySell="BUY" quantity="100" tradePrice="150.25" tradeDate="2024-01-15" ibCommission="-1.00" currency="USD" assetCategory="STK" exchange="SMART" transactionID="1234"/>
            <Trade symbol="MSFT" buySell="SELL" quantity="-50" tradePrice="380.00" tradeDate="2024-02-20" ibCommission="-0.50" currency="USD" assetCategory="STK" exchange="SMART" transactionID="1235"/>
          </Trades>
        </FlexStatement>
      </FlexStatements>
    </FlexQueryResponse>`;

    const statement = parseFlexStatement(xml);
    expect(statement.trades).toHaveLength(2);
    expect(statement.trades[0]!.symbol).toBe("AAPL");
    expect(statement.trades[0]!.buySell).toBe("BUY");
    expect(statement.trades[0]!.quantity).toBe(100);
    expect(statement.trades[0]!.ibCommission).toBe(1.0);
    expect(statement.trades[1]!.symbol).toBe("MSFT");
    expect(statement.trades[1]!.quantity).toBe(50);
  });

  it("parses cash transactions from XML", () => {
    const xml = `<FlexQueryResponse>
      <FlexStatements>
        <FlexStatement>
          <CashTransactions>
            <CashTransaction type="Dividends" dateTime="2024-03-15" amount="82.00" currency="USD" symbol="AAPL" description="CASH DIVIDEND"/>
            <CashTransaction type="Deposits &amp; Withdrawals" dateTime="2024-01-10" amount="10000.00" currency="USD" description="WIRE TRANSFER"/>
            <CashTransaction type="Withholding Tax" dateTime="2024-03-15" amount="-12.30" currency="USD" symbol="AAPL" description="WITHHOLDING TAX"/>
          </CashTransactions>
        </FlexStatement>
      </FlexStatements>
    </FlexQueryResponse>`;

    const statement = parseFlexStatement(xml);
    expect(statement.cashTransactions).toHaveLength(3);
    expect(statement.cashTransactions[0]!.type).toBe("Dividends");
    expect(statement.cashTransactions[1]!.type).toBe("Deposits & Withdrawals");
    expect(statement.cashTransactions[2]!.type).toBe("Withholding Tax");
  });

  it("parses dateTime with time component", () => {
    const xml = `<FlexQueryResponse>
      <FlexStatements>
        <FlexStatement>
          <CashTransactions>
            <CashTransaction type="Dividends" dateTime="2024-03-15;10:30:00" amount="50.00" currency="USD" symbol="AAPL" description="DIV"/>
          </CashTransactions>
        </FlexStatement>
      </FlexStatements>
    </FlexQueryResponse>`;

    const statement = parseFlexStatement(xml);
    expect(statement.cashTransactions[0]!.dateTime).toBe("2024-03-15");
  });
});

describe("IBKR Import", () => {
  it("[UC-IMPORT-001-S01] imports buy trades as transactions and lots", async () => {
    const client = new FakeIbkrFlexClient();
    client.setStatement("t|q", {
      trades: [
        {
          symbol: "AAPL",
          buySell: "BUY",
          quantity: 100,
          tradePrice: 150,
          tradeDate: "2024-01-15",
          ibCommission: 1,
          currency: "USD",
          assetCategory: "STK",
          exchange: "SMART",
          transactionId: "1001",
        },
      ],
      cashTransactions: [],
    });

    const result = await importIbkrStatement(db, portfolioId, client, "t", "q");

    expect(result.trades_imported).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);

    const txRow = await db
      .prepare("SELECT symbol, type, quantity, price, fee FROM transactions WHERE portfolio_id = ?")
      .bind(portfolioId)
      .first<{ symbol: string; type: string; quantity: number; price: number; fee: number }>();
    expect(txRow!.symbol).toBe("AAPL");
    expect(txRow!.type).toBe("buy");
    expect(txRow!.quantity).toBe(100);
    expect(txRow!.price).toBe(150);
    expect(txRow!.fee).toBe(1);

    const lotRow = await db
      .prepare("SELECT quantity, remaining_quantity, cost_basis FROM lots WHERE portfolio_id = ?")
      .bind(portfolioId)
      .first<{ quantity: number; remaining_quantity: number; cost_basis: number }>();
    expect(lotRow!.quantity).toBe(100);
    expect(lotRow!.remaining_quantity).toBe(100);
  });

  it("[UC-IMPORT-001-S02] imports deposits as transfers", async () => {
    const client = new FakeIbkrFlexClient();
    client.setStatement("t|q", {
      trades: [],
      cashTransactions: [
        {
          type: "Deposits & Withdrawals",
          dateTime: "2024-01-10",
          amount: 10000,
          currency: "USD",
          symbol: "",
          description: "WIRE TRANSFER",
        },
      ],
    });

    const result = await importIbkrStatement(db, portfolioId, client, "t", "q");

    expect(result.transfers_imported).toBe(1);

    const transferRow = await db
      .prepare("SELECT type, amount FROM transfers WHERE portfolio_id = ?")
      .bind(portfolioId)
      .first<{ type: string; amount: number }>();
    expect(transferRow!.type).toBe("deposit");
    expect(transferRow!.amount).toBe(10000);
  });

  it("[UC-IMPORT-001-S03] imports dividends with withholding tax merged", async () => {
    const client = new FakeIbkrFlexClient();
    client.setStatement("t|q", {
      trades: [],
      cashTransactions: [
        {
          type: "Dividends",
          dateTime: "2024-03-15",
          amount: 82,
          currency: "USD",
          symbol: "AAPL",
          description: "DIVIDEND",
        },
        {
          type: "Withholding Tax",
          dateTime: "2024-03-15",
          amount: -12.3,
          currency: "USD",
          symbol: "AAPL",
          description: "TAX",
        },
      ],
    });

    const result = await importIbkrStatement(db, portfolioId, client, "t", "q");

    expect(result.dividends_imported).toBe(1);

    const txRow = await db
      .prepare(
        "SELECT symbol, type, price, fee FROM transactions WHERE portfolio_id = ? AND type = 'dividend'",
      )
      .bind(portfolioId)
      .first<{ symbol: string; type: string; price: number; fee: number }>();
    expect(txRow!.symbol).toBe("AAPL");
    expect(txRow!.price).toBe(82);
    expect(txRow!.fee).toBe(12.3);
  });

  it("[UC-IMPORT-001-S04] deduplicates existing transactions", async () => {
    // Pre-seed a transaction
    await db
      .prepare(
        "INSERT INTO transactions (portfolio_id, symbol, type, quantity, price, fee, date) VALUES (?, 'AAPL', 'buy', 100, 150, 1, '2024-01-15')",
      )
      .bind(portfolioId)
      .run();

    const client = new FakeIbkrFlexClient();
    client.setStatement("t|q", {
      trades: [
        {
          symbol: "AAPL",
          buySell: "BUY",
          quantity: 100,
          tradePrice: 150,
          tradeDate: "2024-01-15",
          ibCommission: 1,
          currency: "USD",
          assetCategory: "STK",
          exchange: "SMART",
          transactionId: "1001",
        },
      ],
      cashTransactions: [],
    });

    const result = await importIbkrStatement(db, portfolioId, client, "t", "q");

    expect(result.trades_imported).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it("[UC-IMPORT-001-S05] returns 401 when unauthenticated", async () => {
    const res = await worker.fetch(`http://localhost/api/portfolios/${portfolioId}/import/ibkr`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "test", query_id: "123" }),
    });
    expect(res.status).toBe(401);
  });

  it("[UC-IMPORT-001-S06] maps HK stock symbols correctly", async () => {
    const client = new FakeIbkrFlexClient();
    client.setStatement("t|q", {
      trades: [
        {
          symbol: "700",
          buySell: "BUY",
          quantity: 200,
          tradePrice: 350,
          tradeDate: "2024-01-20",
          ibCommission: 15,
          currency: "HKD",
          assetCategory: "STK",
          exchange: "SEHK",
          transactionId: "2001",
        },
      ],
      cashTransactions: [],
    });

    const result = await importIbkrStatement(db, portfolioId, client, "t", "q");

    expect(result.trades_imported).toBe(1);

    const txRow = await db
      .prepare("SELECT symbol FROM transactions WHERE portfolio_id = ?")
      .bind(portfolioId)
      .first<{ symbol: string }>();
    expect(txRow!.symbol).toBe("0700.HK");
  });

  it("[UC-IMPORT-001-S07] handles API errors gracefully", async () => {
    const client = new FakeIbkrFlexClient();
    client.setError("Invalid token");

    await expect(importIbkrStatement(db, portfolioId, client, "bad", "token")).rejects.toThrow(
      "Invalid token",
    );
  });
});
