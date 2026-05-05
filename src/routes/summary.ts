import { Hono } from "hono";
import type { AuthVariables } from "../middleware/auth";
import type { Bindings } from "../types";
import type {
  AggregatedPortfolioSummary,
  AggregatedSummary,
  Portfolio,
  PortfolioSummary,
} from "../../shared/types/api";
import { getPortfolioSummary } from "./portfolios";
import { getExchangeRate } from "../lib/currency";

function convertSummary(summary: PortfolioSummary, rate: number): PortfolioSummary {
  return {
    total_investment: Math.round(summary.total_investment * rate * 100) / 100,
    securities_value: Math.round(summary.securities_value * rate * 100) / 100,
    cash_balance: Math.round(summary.cash_balance * rate * 100) / 100,
    portfolio_value: Math.round(summary.portfolio_value * rate * 100) / 100,
    unrealized_pnl: Math.round(summary.unrealized_pnl * rate * 100) / 100,
    realized_pnl: Math.round(summary.realized_pnl * rate * 100) / 100,
    dividend_income: Math.round(summary.dividend_income * rate * 100) / 100,
    total_pnl: Math.round(summary.total_pnl * rate * 100) / 100,
    return_rate: summary.return_rate,
    cumulative_buy_fees: Math.round(summary.cumulative_buy_fees * rate * 100) / 100,
    cumulative_sell_fees: Math.round(summary.cumulative_sell_fees * rate * 100) / 100,
    cumulative_withholding_tax: Math.round(summary.cumulative_withholding_tax * rate * 100) / 100,
    cumulative_total_fees: Math.round(summary.cumulative_total_fees * rate * 100) / 100,
    price_updated_at: summary.price_updated_at,
  };
}

const summary = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>();

summary.get("/", async (c) => {
  const user = c.get("user");
  const targetCurrency = c.req.query("currency") ?? "USD";

  if (!["USD", "HKD", "CNY"].includes(targetCurrency)) {
    return c.json({ error: "Currency must be USD, HKD, or CNY" }, 400);
  }

  const portfolios = await c.env.DB.prepare(
    "SELECT id, user_id, name, currency, created_at, archived, deleted_at FROM portfolios WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at",
  )
    .bind(user.id)
    .all<Portfolio>();

  const portfolioSummaries: AggregatedPortfolioSummary[] = [];
  let totalInvestment = 0;
  let securitiesValue = 0;
  let cashBalance = 0;
  let portfolioValue = 0;
  let unrealizedPnl = 0;
  let realizedPnl = 0;
  let dividendIncome = 0;
  let totalPnl = 0;
  let cumulativeBuyFees = 0;
  let cumulativeSellFees = 0;
  let cumulativeWithholdingTax = 0;
  let cumulativeTotalFees = 0;
  let oldestRateDate: string | null = null;
  let oldestPriceDate: string | null = null;

  for (const portfolio of portfolios.results) {
    const nativeSummary = await getPortfolioSummary(c.env.DB, portfolio.id);

    let convertedSummary: PortfolioSummary | null = null;

    if (portfolio.currency === targetCurrency) {
      convertedSummary = nativeSummary;
      // No rate lookup needed for same currency
    } else {
      const rate = await getExchangeRate(c.env.DB, portfolio.currency, targetCurrency);
      if (rate !== null) {
        convertedSummary = convertSummary(nativeSummary, rate);

        // Track oldest rate date (try both directions since rates may be stored either way)
        let rateDateRow = await c.env.DB.prepare(
          "SELECT date FROM exchange_rates WHERE from_currency = ? AND to_currency = ? ORDER BY date DESC LIMIT 1",
        )
          .bind(portfolio.currency, targetCurrency)
          .first<{ date: string }>();
        if (!rateDateRow) {
          rateDateRow = await c.env.DB.prepare(
            "SELECT date FROM exchange_rates WHERE from_currency = ? AND to_currency = ? ORDER BY date DESC LIMIT 1",
          )
            .bind(targetCurrency, portfolio.currency)
            .first<{ date: string }>();
        }
        if (rateDateRow) {
          if (!oldestRateDate || rateDateRow.date < oldestRateDate) {
            oldestRateDate = rateDateRow.date;
          }
        }
      }
    }

    portfolioSummaries.push({
      portfolio_id: portfolio.id,
      portfolio_name: portfolio.name,
      native_currency: portfolio.currency,
      native_summary: nativeSummary,
      converted_summary: convertedSummary,
    });

    if (convertedSummary) {
      totalInvestment += convertedSummary.total_investment;
      securitiesValue += convertedSummary.securities_value;
      cashBalance += convertedSummary.cash_balance;
      portfolioValue += convertedSummary.portfolio_value;
      unrealizedPnl += convertedSummary.unrealized_pnl;
      realizedPnl += convertedSummary.realized_pnl;
      dividendIncome += convertedSummary.dividend_income;
      totalPnl += convertedSummary.total_pnl;
      cumulativeBuyFees += convertedSummary.cumulative_buy_fees;
      cumulativeSellFees += convertedSummary.cumulative_sell_fees;
      cumulativeWithholdingTax += convertedSummary.cumulative_withholding_tax;
      cumulativeTotalFees += convertedSummary.cumulative_total_fees;
    }

    // Track oldest price date
    if (nativeSummary.price_updated_at) {
      if (!oldestPriceDate || nativeSummary.price_updated_at < oldestPriceDate) {
        oldestPriceDate = nativeSummary.price_updated_at;
      }
    }
  }

  const returnRate = totalInvestment > 0 ? (totalPnl / totalInvestment) * 100 : 0;

  const result: AggregatedSummary = {
    target_currency: targetCurrency,
    total_investment: Math.round(totalInvestment * 100) / 100,
    securities_value: Math.round(securitiesValue * 100) / 100,
    cash_balance: Math.round(cashBalance * 100) / 100,
    portfolio_value: Math.round(portfolioValue * 100) / 100,
    unrealized_pnl: Math.round(unrealizedPnl * 100) / 100,
    realized_pnl: Math.round(realizedPnl * 100) / 100,
    dividend_income: Math.round(dividendIncome * 100) / 100,
    total_pnl: Math.round(totalPnl * 100) / 100,
    return_rate: Math.round(returnRate * 100) / 100,
    cumulative_buy_fees: Math.round(cumulativeBuyFees * 100) / 100,
    cumulative_sell_fees: Math.round(cumulativeSellFees * 100) / 100,
    cumulative_withholding_tax: Math.round(cumulativeWithholdingTax * 100) / 100,
    cumulative_total_fees: Math.round(cumulativeTotalFees * 100) / 100,
    price_updated_at: oldestPriceDate,
    exchange_rate_updated_at: oldestRateDate,
    portfolios: portfolioSummaries,
  };

  return c.json({ data: result });
});

export default summary;
