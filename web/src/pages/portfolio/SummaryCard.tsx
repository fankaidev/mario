import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "../../components/ui/card";
import { get } from "../../lib/api";
import type { Summary } from "./types";

function MetricBox({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number | string;
  highlight?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`text-base md:text-lg font-medium ${highlight ? "font-bold" : ""} ${typeof value === "number" && value >= 0 ? "text-green-700" : typeof value === "number" ? "text-red-700" : ""}`}
      >
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
    </div>
  );
}

export function SummaryCard({ id }: { id: string }) {
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
          <MetricBox label="Total Investment" value={s.total_investment} />
          <MetricBox label="Securities Value" value={s.securities_value} />
          <MetricBox label="Cash Balance" value={s.cash_balance} />
          <MetricBox label="Portfolio Value" value={s.portfolio_value} />
          <MetricBox label="Total P&L" value={s.total_pnl} highlight />
          <MetricBox label="Return Rate" value={`${s.return_rate}%`} />
        </div>
      </CardContent>
    </Card>
  );
}
