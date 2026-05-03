import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LineChart } from "../../components/LineChart";
import { Button } from "../../components/ui/button";
import { Switch } from "../../components/ui/switch";
import { get } from "../../lib/api";
import type { PriceHistoryResponse, Transaction } from "../../../../shared/types/api";

export function PriceHistorySection({
  id,
  symbol,
  isVisible,
}: {
  id: string;
  symbol: string;
  isVisible: boolean;
}) {
  const [range, setRange] = useState<"1M" | "3M" | "6M" | "YTD" | "1Y" | "3Y" | "ALL">("1Y");
  const [yFromZero, setYFromZero] = useState(false);

  const { startDate } = useMemo(() => {
    const today = new Date();
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
      case "3Y":
        start = new Date(today.getFullYear() - 3, today.getMonth(), today.getDate());
        break;
      case "ALL":
        return { startDate: undefined };
    }
    return {
      startDate: start.toISOString().split("T")[0],
    };
  }, [range]);

  const { data, isLoading } = useQuery({
    queryKey: ["price-history", symbol, startDate],
    queryFn: () =>
      get<{ data: PriceHistoryResponse }>(
        `/prices/history/${symbol}${startDate ? `?start_date=${startDate}` : ""}`,
      ),
    enabled: isVisible,
  });

  const prices = data?.data?.prices ?? [];

  const { data: txData } = useQuery({
    queryKey: ["transactions", id],
    queryFn: () => get<{ data: Transaction[] }>(`/portfolios/${id}/transactions`),
    enabled: isVisible,
  });

  const symbolTransactions = useMemo(
    () => (txData?.data ?? []).filter((tx) => tx.symbol === symbol),
    [txData?.data, symbol],
  );

  const markers = useMemo(() => {
    const txs = symbolTransactions;
    const result: Array<{ index: number; label: string; color: string }> = [];
    for (const tx of txs) {
      if (tx.type !== "buy" && tx.type !== "sell" && tx.type !== "initial") continue;
      if (!tx.date) continue;
      let bestIdx = -1;
      let bestDiff = Infinity;
      const txTime = new Date(tx.date).getTime();
      for (let i = 0; i < prices.length; i++) {
        const p = prices[i];
        if (!p) continue;
        const diff = Math.abs(new Date(p.date).getTime() - txTime);
        if (diff < bestDiff) {
          bestDiff = diff;
          bestIdx = i;
        }
      }
      if (bestIdx >= 0) {
        result.push({
          index: bestIdx,
          label: tx.type === "sell" ? "S" : "B",
          color: tx.type === "sell" ? "#dc2626" : "#16a34a",
        });
      }
    }
    return result;
  }, [symbolTransactions, prices]);

  if (!isVisible) return null;

  return (
    <div className="mt-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1">
          {(["1M", "3M", "6M", "YTD", "1Y", "3Y", "ALL"] as const).map((r) => (
            <Button
              key={r}
              size="sm"
              variant={range === r ? "default" : "outline"}
              className="h-6 px-2 text-xs"
              onClick={() => setRange(r)}
            >
              {r}
            </Button>
          ))}
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <Switch checked={yFromZero} onCheckedChange={setYFromZero} />
          Include Zero
        </label>
      </div>
      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading chart...</p>
      ) : prices.length === 0 ? (
        <p className="text-xs text-muted-foreground">No price history available</p>
      ) : (
        <div className="rounded-xl border bg-card shadow-sm p-3">
          <LineChart
            data={prices.map((p) => ({
              label: p.date,
              values: [{ key: "close", value: p.close, color: "#2563eb" }],
            }))}
            height={180}
            formatValue={(v) => v.toFixed(2)}
            minValue={yFromZero ? 0 : undefined}
            markers={markers}
          />
          <div className="mt-1 text-xs text-muted-foreground">
            <span className="inline-block h-0.5 w-3 bg-blue-600" /> Close Price
          </div>
        </div>
      )}
    </div>
  );
}
