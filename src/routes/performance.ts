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

function addRatePair(
  pairs: Map<string, { from: string; to: string }>,
  from: string,
  to: string,
): void {
  pairs.set(`${from}→${to}`, { from, to });
}

function getRateFromCache(
  rateArrays: Map<string, Array<{ date: string; rate: number }>>,
  rateCursors: Map<string, number>,
  from: string,
  to: string,
  targetDate: string,
): number | null {
  const direct = getRateWithCursor(rateArrays, rateCursors, from, to, targetDate);
  if (direct !== null) return direct;

  const inverse = getRateWithCursor(rateArrays, rateCursors, to, from, targetDate);
  if (inverse !== null) return 1 / inverse;

  if ((from === "HKD" || from === "CNY") && (to === "HKD" || to === "CNY")) {
    let fromToUsd = getRateWithCursor(rateArrays, rateCursors, from, "USD", targetDate);
    if (fromToUsd === null) {
      const inv = getRateWithCursor(rateArrays, rateCursors, "USD", from, targetDate);
      fromToUsd = inv !== null ? 1 / inv : null;
    }
    let toToUsd = getRateWithCursor(rateArrays, rateCursors, to, "USD", targetDate);
    if (toToUsd === null) {
      const inv = getRateWithCursor(rateArrays, rateCursors, "USD", to, targetDate);
      toToUsd = inv !== null ? 1 / inv : null;
    }
    if (fromToUsd !== null && toToUsd !== null) {
      return fromToUsd / toToUsd;
    }
  }

  return null;
}

function getRateWithCursor(
  rateArrays: Map<string, Array<{ date: string; rate: number }>>,
  rateCursors: Map<string, number>,
  from: string,
  to: string,
  targetDate: string,
): number | null {
  const key = `${from}→${to}`;
  const rates = rateArrays.get(key);
  if (!rates || rates.length === 0) return null;

  let cursor = rateCursors.get(key) ?? 0;
  while (cursor + 1 < rates.length && rates[cursor + 1]!.date <= targetDate) {
    cursor++;
  }
  rateCursors.set(key, cursor);

  const rate = rates[cursor]!;
  if (rate.date <= targetDate) {
    return rate.rate;
  }
  return null;
}

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

  // Compute P&L (netCashFlow uses IRR convention: deposits are negative)
  const pnl = endValue - startValue + netCashFlow;

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
        // Include portfolio without converted values when rates are missing
        portfolioResults.push(nativePerf);
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

      const convPnl = Math.round((convEnd - convStart + convNetCashFlow) * 100) / 100;

      aggStartValue += convStart;
      aggEndValue += convEnd;
      aggNetCashFlow += Math.round(convNetCashFlow * 100) / 100;
      aggPnl += convPnl;

      nativePerf.converted_currency = targetCurrency;
      nativePerf.converted_end_value = convEnd;
      nativePerf.converted_pnl = convPnl;

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
  const irr = computeRangeIRR(aggStartValue, startDate, aggCashFlows, aggEndValue, endDate);
  if (irr !== null) {
    aggReturnRate = irr * 100;
  } else if (aggStartValue > 0) {
    aggReturnRate = (aggPnl / aggStartValue) * 100;
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
  const portfolioIdsStr = c.req.query("portfolio_ids");

  if (!range || !VALID_RANGES.includes(range as RangeType)) {
    return c.json({ error: "Valid range parameter is required (1M, 3M, 6M, YTD, 1Y, ALL)" }, 400);
  }
  if (!["USD", "HKD", "CNY"].includes(targetCurrency)) {
    return c.json({ error: "Currency must be USD, HKD, or CNY" }, 400);
  }

  let portfolioFilter = " AND deleted_at IS NULL";
  const params: unknown[] = [user.id];

  if (portfolioIdsStr) {
    const ids = portfolioIdsStr
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n));
    if (ids.length > 0) {
      portfolioFilter = " AND id IN (" + ids.map(() => "?").join(",") + ")";
      params.push(...ids);
    }
  }

  const { startDate } = getRangeDates(range as RangeType);

  const portfolios = await c.env.DB.prepare(
    `SELECT id, name, currency FROM portfolios WHERE user_id = ?${portfolioFilter} ORDER BY created_at`,
  )
    .bind(...params)
    .all<{ id: number; name: string; currency: string }>();

  if (portfolios.results.length === 0) return c.json({ data: [] });

  // Pre-fetch exchange rates for non-USD portfolios
  const rateArrays = new Map<string, Array<{ date: string; rate: number }>>();
  const ratePairs = new Map<string, { from: string; to: string }>();

  for (const p of portfolios.results) {
    if (p.currency === targetCurrency) continue;
    addRatePair(ratePairs, p.currency, targetCurrency);
    addRatePair(ratePairs, targetCurrency, p.currency);
    if (
      (p.currency === "HKD" && targetCurrency === "CNY") ||
      (p.currency === "CNY" && targetCurrency === "HKD")
    ) {
      addRatePair(ratePairs, p.currency, "USD");
      addRatePair(ratePairs, "USD", p.currency);
      addRatePair(ratePairs, targetCurrency, "USD");
      addRatePair(ratePairs, "USD", targetCurrency);
    }
  }

  if (ratePairs.size > 0) {
    const conds: string[] = [];
    const rateParams: string[] = [];
    for (const pair of ratePairs.values()) {
      conds.push("(from_currency = ? AND to_currency = ?)");
      rateParams.push(pair.from, pair.to);
    }
    const rateRows = await c.env.DB.prepare(
      `SELECT from_currency, to_currency, date, rate FROM exchange_rates WHERE ${conds.join(" OR ")} ORDER BY from_currency, to_currency, date ASC`,
    )
      .bind(...rateParams)
      .all<{ from_currency: string; to_currency: string; date: string; rate: number }>();

    for (const row of rateRows.results) {
      const key = `${row.from_currency}→${row.to_currency}`;
      let arr = rateArrays.get(key);
      if (!arr) {
        arr = [];
        rateArrays.set(key, arr);
      }
      arr.push({ date: row.date, rate: row.rate });
    }
  }

  const rateCursors = new Map<string, number>();

  // Fetch all snapshots in one query
  const portfolioIds = portfolios.results.map((p) => p.id);
  const snapshotParams: unknown[] = [...portfolioIds, range === "ALL" ? "0000-01-01" : startDate];

  const snapshotRows = await c.env.DB.prepare(
    `SELECT portfolio_id, date, market_value, cash_balance FROM portfolio_snapshots WHERE portfolio_id IN (${portfolioIds.map(() => "?").join(",")}) AND date >= ? ORDER BY portfolio_id, date ASC`,
  )
    .bind(...snapshotParams)
    .all<{ portfolio_id: number; date: string; market_value: number; cash_balance: number }>();

  const portfolioSnapshots = new Map<number, Array<{ date: string; value: number }>>();
  const allDates = new Set<string>();

  for (const row of snapshotRows.results) {
    allDates.add(row.date);
    let snaps = portfolioSnapshots.get(row.portfolio_id);
    if (!snaps) {
      snaps = [];
      portfolioSnapshots.set(row.portfolio_id, snaps);
    }
    snaps.push({ date: row.date, value: row.market_value + row.cash_balance });
  }

  if (allDates.size === 0) return c.json({ data: [] });

  const sortedDates = [...allDates].sort();

  // Build chart points with two-pointer forward-fill
  const points: AggregatedChartPoint[] = [];
  const snapCursors = new Map<number, number>();

  for (const date of sortedDates) {
    let totalValue = 0;

    for (const portfolio of portfolios.results) {
      const snaps = portfolioSnapshots.get(portfolio.id);
      if (!snaps || snaps.length === 0) continue;

      let cursor = snapCursors.get(portfolio.id) ?? 0;
      while (cursor + 1 < snaps.length && snaps[cursor + 1]!.date <= date) {
        cursor++;
      }
      snapCursors.set(portfolio.id, cursor);

      if (snaps[cursor]!.date > date) continue;

      const value = snaps[cursor]!.value;
      if (portfolio.currency === targetCurrency) {
        totalValue += value;
      } else {
        const rate = getRateFromCache(
          rateArrays,
          rateCursors,
          portfolio.currency,
          targetCurrency,
          date,
        );
        if (rate !== null) {
          totalValue += value * rate;
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
