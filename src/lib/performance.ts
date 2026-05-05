import type { RangeType } from "../../shared/types/api";
import type { CashFlow } from "../lib/finance";
import { calculateXIRR } from "../lib/finance";

export function getRangeDates(range: RangeType): { startDate: string; endDate: string } {
  const today = new Date();
  const endDate = today.toISOString().split("T")[0]!;

  let start: Date;
  switch (range) {
    case "1M":
      start = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate());
      break;
    case "3M":
      start = new Date(today.getFullYear(), today.getMonth() - 3, today.getDate());
      break;
    case "6M":
      start = new Date(today.getFullYear(), today.getMonth() - 6, today.getDate());
      break;
    case "YTD":
      start = new Date(today.getFullYear(), 0, 1);
      break;
    case "1Y":
      start = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
      break;
    case "ALL":
      return { startDate: "0000-01-01", endDate };
  }

  return { startDate: start.toISOString().split("T")[0]!, endDate };
}

export async function getPortfolioValueAtDate(
  db: D1Database,
  portfolioId: number,
  date: string,
): Promise<{ marketValue: number; cashBalance: number; totalInvestment: number } | null> {
  const snap = await db
    .prepare(
      "SELECT market_value, cash_balance, total_investment FROM portfolio_snapshots WHERE portfolio_id = ? AND date <= ? ORDER BY date DESC LIMIT 1",
    )
    .bind(portfolioId, date)
    .first<{ market_value: number; cash_balance: number; total_investment: number }>();

  if (snap) {
    return {
      marketValue: snap.market_value,
      cashBalance: snap.cash_balance,
      totalInvestment: snap.total_investment,
    };
  }

  return null;
}

export async function getCashFlowsInRange(
  db: D1Database,
  portfolioId: number,
  startDate: string,
  endDate: string,
): Promise<CashFlow[]> {
  const rows = await db
    .prepare(
      "SELECT type, amount, fee, date FROM cash_movements WHERE portfolio_id = ? AND type != 'interest' AND date > ? AND date <= ? ORDER BY date",
    )
    .bind(portfolioId, startDate, endDate)
    .all<{ type: string; amount: number; fee: number; date: string }>();

  return rows.results.map((row) => ({
    date: row.date,
    amount: row.type === "withdrawal" ? row.amount + row.fee : -(row.amount - row.fee),
  }));
}

export function computeRangeIRR(
  startValue: number,
  startDate: string,
  cashFlowsInRange: CashFlow[],
  endValue: number,
  endDate: string,
): number | null {
  const flows: CashFlow[] = [];

  if (startValue > 0) {
    flows.push({ date: startDate, amount: -startValue });
  }

  for (const cf of cashFlowsInRange) {
    flows.push(cf);
  }

  if (endValue > 0 || flows.length > 0) {
    flows.push({ date: endDate, amount: endValue });
  }

  if (flows.length < 2) return null;

  const sorted = [...flows].sort((a, b) => a.date.localeCompare(b.date));
  const allPositive = sorted.every((f) => f.amount > 0);
  const allNegative = sorted.every((f) => f.amount < 0);
  if (allPositive || allNegative) return null;

  return calculateXIRR(flows);
}
