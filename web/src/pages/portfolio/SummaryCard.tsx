import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "../../components/ui/card";
import { get } from "../../lib/api";
import type { Summary } from "./types";

function MetricBox({
  label,
  value,
  currency,
  highlight,
}: {
  label: string;
  value: number | string;
  currency?: string;
  highlight?: boolean;
}) {
  const formatted =
    typeof value === "number"
      ? `${Math.round(value).toLocaleString()}${currency ? " " + currency : ""}`
      : value;
  return (
    <div className="text-center">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`text-base md:text-lg font-medium ${highlight ? "font-bold" : ""} ${typeof value === "number" && value >= 0 ? "text-green-700" : typeof value === "number" ? "text-red-700" : ""}`}
      >
        {formatted}
      </p>
    </div>
  );
}

export function SummaryCard({ id, currency }: { id: string; currency: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["summary", id],
    queryFn: () => get<{ data: Summary }>(`/portfolios/${id}/summary`),
  });

  if (isLoading) return null;
  const s = data?.data;
  if (!s) return null;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <MetricBox label="Portfolio Value" value={s.portfolio_value} currency={currency} />
          <MetricBox label="Securities Value" value={s.securities_value} currency={currency} />
          <MetricBox label="Cash Balance" value={s.cash_balance} currency={currency} />
          <MetricBox label="Total Investment" value={s.total_investment} currency={currency} />
          <MetricBox label="Dividend Income" value={s.dividend_income} currency={currency} />
          <MetricBox label="Return Rate" value={`${s.return_rate}%`} />
          <MetricBox label="Total P&L" value={s.total_pnl} currency={currency} highlight />
          <MetricBox label="Unrealized P&L" value={s.unrealized_pnl} currency={currency} />
          <MetricBox label="Realized P&L" value={s.realized_pnl} currency={currency} />
        </div>
        {s.price_updated_at && (
          <p className="mt-3 text-right text-xs text-muted-foreground">
            Prices as of: {s.price_updated_at}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
