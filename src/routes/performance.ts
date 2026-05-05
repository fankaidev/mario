import { Hono } from "hono";
import type { AuthVariables } from "../middleware/auth";
import type { Bindings } from "../types";
import type {
  AggregatedChartPoint,
  AggregatedPerformance,
  PortfolioPerformance,
  RangeType,
} from "../../shared/types/api";
import { getPortfolioSummary } from "./portfolios";
import { getExchangeRate } from "../lib/currency";
import { type CashFlow } from "../lib/finance";
import {
  getRangeDates,
  getPortfolioValueAtDate,
  getCashFlowsInRange,
  computeRangeIRR,
} from "../lib/performance";

const VALID_RANGES: RangeType[] = ["1M", "3M", "6M", "YTD", "1Y", "ALL"];

export async function computePortfolioPerformance(
  db: D1Database,
  portfolioId: number,
  portfolioName: string,
  nativeCurrency: string,
  range: RangeType,
): Promise<PortfolioPerformance | null> {
  const { startDate, endDate } = getRangeDates(range);

  // Get end value from current summary
  const summary = await getPortfolioSummary(db, portfolioId);
  const endValue = summary.portfolio_value;

  // Get start value (0 for ALL, from snapshot for ranges)
  let startValue: number;
  if (range === "ALL") {
    startValue = 0;
  } else {
    const startVal = await getPortfolioValueAtDate(db, portfolioId, startDate);
    if (startVal === null) return null;
    startValue = startVal.marketValue + startVal.cashBalance;
  }

  // Get cash flows within the range
  const cashFlows = await getCashFlowsInRange(db, portfolioId, startDate, endDate);
  const netCashFlow = cashFlows.reduce((sum, cf) => sum + cf.amount, 0);

  // Compute P&L
  const pnl = endValue - startValue - netCashFlow;

  // Compute range-scoped IRR
  let returnRate: number;
  const irr = computeRangeIRR(startValue, startDate, cashFlows, endValue, endDate);
  if (irr !== null) {
    returnRate = irr * 100;
  } else {
    // Fallback to simple return
    returnRate = startValue > 0 ? (pnl / startValue) * 100 : 0;
  }

  return {
    portfolio_id: portfolioId,
    portfolio_name: portfolioName,
    native_currency: nativeCurrency,
    range,
    start_date: startDate,
    end_date: endDate,
    start_value: Math.round(startValue * 100) / 100,
    end_value: Math.round(endValue * 100) / 100,
    net_cash_flow: Math.round(netCashFlow * 100) / 100,
    pnl: Math.round(pnl * 100) / 100,
    return_rate: Math.round(returnRate * 100) / 100,
  };
}

// Mounted at /api/portfolios/:portfolioId/performance
const portfolioPerformanceRouter = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>();

portfolioPerformanceRouter.get("/", async (c) => {
  const user = c.get("user");
  const portfolioId = parseInt(c.req.param("portfolioId") ?? "", 10);
  if (isNaN(portfolioId)) return c.json({ error: "Invalid portfolio ID" }, 400);

  const range = c.req.query("range");
  if (!range || !VALID_RANGES.includes(range as RangeType)) {
    return c.json({ error: "Valid range parameter is required (1M, 3M, 6M, YTD, 1Y, ALL)" }, 400);
  }

  const portfolio = await c.env.DB.prepare(
    "SELECT id, name, currency FROM portfolios WHERE id = ? AND user_id = ? AND deleted_at IS NULL",
  )
    .bind(portfolioId, user.id)
    .first<{ id: number; name: string; currency: string }>();
  if (!portfolio) return c.json({ error: "Portfolio not found" }, 404);

  const perf = await computePortfolioPerformance(
    c.env.DB,
    portfolio.id,
    portfolio.name,
    portfolio.currency,
    range as RangeType,
  );

  if (!perf) return c.json({ error: "Could not compute performance for this range" }, 400);

  return c.json({ data: perf });
});

// Mounted at /api/performance
const aggregatedPerformanceRouter = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>();

aggregatedPerformanceRouter.get("/", async (c) => {
  const user = c.get("user");
  const range = c.req.query("range");
  const targetCurrency = c.req.query("currency") ?? "USD";

  if (!range || !VALID_RANGES.includes(range as RangeType)) {
    return c.json({ error: "Valid range parameter is required (1M, 3M, 6M, YTD, 1Y, ALL)" }, 400);
  }
  if (!["USD", "HKD", "CNY"].includes(targetCurrency)) {
    return c.json({ error: "Currency must be USD, HKD, or CNY" }, 400);
  }

  const portfolios = await c.env.DB.prepare(
    "SELECT id, name, currency FROM portfolios WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at",
  )
    .bind(user.id)
    .all<{ id: number; name: string; currency: string }>();

  const { startDate, endDate } = getRangeDates(range as RangeType);

  let aggStartValue = 0;
  let aggEndValue = 0;
  let aggNetCashFlow = 0;
  let aggPnl = 0;
  const aggCashFlows: CashFlow[] = [];
  const portfolioResults: PortfolioPerformance[] = [];
  let oldestRateDate: string | null = null;

  for (const portfolio of portfolios.results) {
    const nativePerf = await computePortfolioPerformance(
      c.env.DB,
      portfolio.id,
      portfolio.name,
      portfolio.currency,
      range as RangeType,
    );

    if (!nativePerf) continue;

    // Convert monetary values to target currency
    if (portfolio.currency === targetCurrency) {
      aggStartValue += nativePerf.start_value;
      aggEndValue += nativePerf.end_value;
      aggNetCashFlow += nativePerf.net_cash_flow;
      aggPnl += nativePerf.pnl;

      // Add native cash flows as-is
      const nativeCashFlows = await getCashFlowsInRange(c.env.DB, portfolio.id, startDate, endDate);
      for (const cf of nativeCashFlows) {
        aggCashFlows.push(cf);
      }
    } else {
      // Convert monetary values
      const startRate = await getExchangeRate(
        c.env.DB,
        portfolio.currency,
        targetCurrency,
        nativePerf.start_date,
      );
      const endRate = await getExchangeRate(
        c.env.DB,
        portfolio.currency,
        targetCurrency,
        nativePerf.end_date,
      );

      if (startRate === null || endRate === null) {
        // Skip portfolio if rates are missing
        continue;
      }

      const convStart = Math.round(nativePerf.start_value * startRate * 100) / 100;
      const convEnd = Math.round(nativePerf.end_value * endRate * 100) / 100;

      // Convert cash flows using per-date rates
      const nativeCashFlows = await getCashFlowsInRange(c.env.DB, portfolio.id, startDate, endDate);
      let convNetCashFlow = 0;
      for (const cf of nativeCashFlows) {
        const cfRate = await getExchangeRate(c.env.DB, portfolio.currency, targetCurrency, cf.date);
        if (cfRate !== null) {
          const convAmount = Math.round(cf.amount * cfRate * 100) / 100;
          convNetCashFlow += convAmount;
          aggCashFlows.push({ date: cf.date, amount: convAmount });
        }
      }

      aggStartValue += convStart;
      aggEndValue += convEnd;
      aggNetCashFlow += Math.round(convNetCashFlow * 100) / 100;
      aggPnl += Math.round((convEnd - convStart - convNetCashFlow) * 100) / 100;

      // Track oldest rate date
      const rateRow = await c.env.DB.prepare(
        "SELECT date FROM exchange_rates WHERE from_currency = ? AND to_currency = ? ORDER BY date DESC LIMIT 1",
      )
        .bind(portfolio.currency, targetCurrency)
        .first<{ date: string }>();
      if (rateRow) {
        if (!oldestRateDate || rateRow.date < oldestRateDate) {
          oldestRateDate = rateRow.date;
        }
      }
    }

    portfolioResults.push(nativePerf);
  }

  // Compute aggregated IRR from combined converted cash flows
  let aggReturnRate: number;
  if (aggStartValue > 0) {
    const irr = computeRangeIRR(aggStartValue, startDate, aggCashFlows, aggEndValue, endDate);
    aggReturnRate = irr !== null ? irr * 100 : (aggPnl / aggStartValue) * 100;
  } else {
    aggReturnRate = 0;
  }

  const result: AggregatedPerformance = {
    target_currency: targetCurrency,
    range: range as RangeType,
    start_date: startDate,
    end_date: endDate,
    start_value: Math.round(aggStartValue * 100) / 100,
    end_value: Math.round(aggEndValue * 100) / 100,
    net_cash_flow: Math.round(aggNetCashFlow * 100) / 100,
    pnl: Math.round(aggPnl * 100) / 100,
    return_rate: Math.round(aggReturnRate * 100) / 100,
    exchange_rate_updated_at: oldestRateDate,
    portfolios: portfolioResults,
  };

  return c.json({ data: result });
});

aggregatedPerformanceRouter.get("/chart", async (c) => {
  const user = c.get("user");
  const range = c.req.query("range");
  const targetCurrency = c.req.query("currency") ?? "USD";

  if (!range || !VALID_RANGES.includes(range as RangeType)) {
    return c.json({ error: "Valid range parameter is required (1M, 3M, 6M, YTD, 1Y, ALL)" }, 400);
  }
  if (!["USD", "HKD", "CNY"].includes(targetCurrency)) {
    return c.json({ error: "Currency must be USD, HKD, or CNY" }, 400);
  }

  const { startDate } = getRangeDates(range as RangeType);

  const portfolios = await c.env.DB.prepare(
    "SELECT id, name, currency FROM portfolios WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at",
  )
    .bind(user.id)
    .all<{ id: number; name: string; currency: string }>();

  // For each portfolio, get all snapshots from the range start
  const portfolioSnapshots: Map<
    number,
    Array<{ date: string; value: number }> & { currency: string }
  > = new Map();

  const allDates = new Set<string>();

  for (const portfolio of portfolios.results) {
    const rows = await c.env.DB.prepare(
      "SELECT date, market_value, cash_balance FROM portfolio_snapshots WHERE portfolio_id = ? AND date >= ? ORDER BY date ASC",
    )
      .bind(portfolio.id, range === "ALL" ? "0000-01-01" : startDate)
      .all<{ date: string; market_value: number; cash_balance: number }>();

    const values: Array<{ date: string; value: number }> = [];
    for (const row of rows.results) {
      allDates.add(row.date);
      values.push({ date: row.date, value: row.market_value + row.cash_balance });
    }

    (values as any).currency = portfolio.currency;
    portfolioSnapshots.set(portfolio.id, values as any);
  }

  if (allDates.size === 0) return c.json({ data: [] });

  const sortedDates = [...allDates].sort();

  // Build chart points: for each date, forward-fill each portfolio's latest value
  const points: AggregatedChartPoint[] = [];
  const lastValues = new Map<number, number>();

  for (const date of sortedDates) {
    let totalValue = 0;

    for (const portfolio of portfolios.results) {
      const snaps = portfolioSnapshots.get(portfolio.id);
      if (!snaps) continue;

      // Find latest snapshot on or before this date
      let latestValue: number | undefined;
      for (const snap of snaps) {
        if (snap.date <= date) {
          latestValue = snap.value;
        } else {
          break;
        }
      }

      if (latestValue !== undefined) {
        lastValues.set(portfolio.id, latestValue);
      }

      const value = lastValues.get(portfolio.id);
      if (value !== undefined) {
        if (portfolio.currency === targetCurrency) {
          totalValue += value;
        } else {
          const rate = await getExchangeRate(c.env.DB, portfolio.currency, targetCurrency, date);
          if (rate !== null) {
            totalValue += value * rate;
          }
        }
      }
    }

    points.push({
      date,
      total_value: Math.round(totalValue * 100) / 100,
    });
  }

  return c.json({ data: points });
});

export { portfolioPerformanceRouter, aggregatedPerformanceRouter };
