import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Wrench, Check, Trash2 } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { EmptyState } from "../../components/EmptyState";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { LineChart } from "../../components/LineChart";
import { get, post, del } from "../../lib/api";
import type { Snapshot, Summary } from "./types";
import { ConfirmModal } from "./ConfirmModal";

function AddSnapshotModal({
  portfolioId,
  onClose,
  onCreated,
}: {
  portfolioId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [date, setDate] = useState(new Date().toISOString().split("T")[0] ?? "");
  const [investment, setInvestment] = useState("");
  const [marketValue, setMarketValue] = useState("");
  const [cashBalance, setCashBalance] = useState("");
  const [note, setNote] = useState("");

  const mutation = useMutation({
    mutationFn: (body: unknown) => post(`/portfolios/${portfolioId}/snapshots`, body),
    onSuccess: onCreated,
  });

  const handleSubmit = () => {
    mutation.mutate({
      date,
      total_investment: parseFloat(investment),
      market_value: parseFloat(marketValue),
      cash_balance: parseFloat(cashBalance) || 0,
      note: note || undefined,
    });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Snapshot</DialogTitle>
        </DialogHeader>
        {mutation.error && <p className="text-sm text-destructive">{mutation.error.message}</p>}
        <div className="space-y-3">
          <div>
            <Label htmlFor="snapshot-date">Date</Label>
            <Input
              id="snapshot-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="snapshot-investment">Total Investment</Label>
            <Input
              id="snapshot-investment"
              type="number"
              value={investment}
              onChange={(e) => setInvestment(e.target.value)}
              placeholder="100000"
            />
          </div>
          <div>
            <Label htmlFor="snapshot-market-value">Securities Value</Label>
            <Input
              id="snapshot-market-value"
              type="number"
              value={marketValue}
              onChange={(e) => setMarketValue(e.target.value)}
              placeholder="120000"
            />
          </div>
          <div>
            <Label htmlFor="snapshot-cash-balance">Cash Balance</Label>
            <Input
              id="snapshot-cash-balance"
              type="number"
              value={cashBalance}
              onChange={(e) => setCashBalance(e.target.value)}
              placeholder="5000"
            />
          </div>
          <div>
            <Label htmlFor="snapshot-note">Note (optional)</Label>
            <Input
              id="snapshot-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Year end snapshot"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={mutation.isPending} onClick={handleSubmit}>
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SummaryTab({ id, currency }: { id: string; currency: string }) {
  const queryClient = useQueryClient();
  const [showAddSnapshot, setShowAddSnapshot] = useState(false);
  const [deleteSnapshotId, setDeleteSnapshotId] = useState<number | null>(null);
  const [manageMode, setManageMode] = useState(false);
  const [chartRange, setChartRange] = useState<"1M" | "3M" | "6M" | "YTD" | "1Y" | "ALL">("1Y");

  const chartCutoff = useMemo(() => {
    const today = new Date();
    let start: Date;
    switch (chartRange) {
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
        return undefined;
    }
    return start.toISOString().split("T")[0];
  }, [chartRange]);

  const { data: summaryData, isLoading: summaryLoading } = useQuery({
    queryKey: ["summary", id],
    queryFn: () => get<{ data: Summary }>(`/portfolios/${id}/summary`),
  });

  const { data: snapshotsData, isLoading: snapshotsLoading } = useQuery({
    queryKey: ["snapshots", id],
    queryFn: () => get<{ data: Snapshot[] }>(`/portfolios/${id}/snapshots`),
  });

  const deleteSnapshotMutation = useMutation({
    mutationFn: (snapshotId: number) =>
      del<{ data: null }>(`/portfolios/${id}/snapshots/${snapshotId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["snapshots", id] });
      setDeleteSnapshotId(null);
    },
  });

  if (summaryLoading || snapshotsLoading)
    return <p className="text-sm text-muted-foreground">Loading...</p>;

  const s = summaryData?.data;
  if (!s) return null;

  const snapshots = snapshotsData?.data ?? [];
  const currentSummary = s;

  interface ChartPoint {
    date: string;
    marketValue: number;
    investment: number;
    returnRate: number;
  }

  const points: ChartPoint[] = snapshots
    .map((snap) => ({
      date: snap.date,
      marketValue: snap.market_value,
      investment: snap.total_investment,
      returnRate:
        snap.return_rate != null
          ? snap.return_rate
          : snap.total_investment > 0
            ? ((snap.market_value - snap.total_investment) / snap.total_investment) * 100
            : 0,
    }))
    .filter((p) => !chartCutoff || p.date >= chartCutoff)
    .reverse();

  if (currentSummary) {
    const today = new Date().toISOString().split("T")[0] ?? "";
    points.push({
      date: today,
      marketValue: Math.round(currentSummary.securities_value * 100) / 100,
      investment: currentSummary.total_investment,
      returnRate: currentSummary.return_rate,
    });
  }

  return (
    <div>
      <h4 className="mb-2 font-semibold">Fees</h4>
      <Card>
        <CardContent className="grid grid-cols-4 gap-4 p-4 text-sm">
          <div className="text-center">
            <p className="text-xs text-muted-foreground">Buy</p>
            <p className="font-medium">
              {s.cumulative_buy_fees.toLocaleString()} {currency}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground">Sell</p>
            <p className="font-medium">
              {s.cumulative_sell_fees.toLocaleString()} {currency}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground">Withholding Tax</p>
            <p className="font-medium">
              {s.cumulative_withholding_tax.toLocaleString()} {currency}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="font-semibold">
              {s.cumulative_total_fees.toLocaleString()} {currency}
            </p>
          </div>
        </CardContent>
      </Card>

      {points.length > 0 && (
        <>
          <div className="mt-6 mb-4 flex items-center justify-between">
            <h3 className="font-semibold">Charts</h3>
            <div className="flex items-center gap-1">
              {(["1M", "3M", "6M", "YTD", "1Y", "ALL"] as const).map((r) => (
                <Button
                  key={r}
                  size="sm"
                  variant={chartRange === r ? "default" : "outline"}
                  className="h-6 px-2 text-xs"
                  onClick={() => setChartRange(r)}
                >
                  {r}
                </Button>
              ))}
            </div>
          </div>
          <h3 className="mb-4 font-semibold">Market Value Over Time</h3>
          <Card className="mb-6">
            <CardContent className="p-4">
              <LineChart
                data={points.map((p) => ({
                  label: p.date,
                  values: [
                    { key: "mv", value: p.marketValue, color: "#2563eb" },
                    { key: "inv", value: p.investment, color: "#9ca3af" },
                  ],
                }))}
                height={250}
                formatValue={(v) => Math.round(v).toLocaleString()}
              />
              <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="inline-block h-0.5 w-3 bg-blue-600" /> Market Value
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-0.5 w-3 bg-[#9ca3af]" /> Investment
                </span>
              </div>
            </CardContent>
          </Card>

          <h3 className="mb-4 font-semibold">Total P&L Over Time</h3>
          <Card className="mb-6">
            <CardContent className="p-4">
              <LineChart
                data={points.map((p) => ({
                  label: p.date,
                  values: [{ key: "pnl", value: p.marketValue - p.investment, color: "#7c3aed" }],
                }))}
                height={250}
                formatValue={(v) => Math.round(v).toLocaleString()}
                minValue={0}
              />
            </CardContent>
          </Card>

          <h3 className="mb-4 font-semibold">Return Rate Over Time</h3>
          <Card className="mb-6">
            <CardContent className="p-4">
              <LineChart
                data={points.map((p) => ({
                  label: p.date,
                  values: [{ key: "rate", value: p.returnRate, color: "#059669" }],
                }))}
                height={250}
                formatValue={(v) => `${v.toFixed(1)}%`}
              />
            </CardContent>
          </Card>
        </>
      )}

      <div className="mb-4 mt-6 flex justify-between">
        <h3 className="font-semibold">Snapshots</h3>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setManageMode(!manageMode)}>
            {manageMode ? <Check className="h-4 w-4" /> : <Wrench className="h-4 w-4" />}
            {manageMode ? "Done" : "Manage"}
          </Button>
          <Button size="sm" onClick={() => setShowAddSnapshot(true)}>
            Add Snapshot
          </Button>
        </div>
      </div>
      {snapshots.length === 0 && <EmptyState message="No snapshots yet." />}
      <div className="space-y-1">
        <div
          className={`grid items-center gap-2 border-b py-2 text-xs font-medium text-muted-foreground ${
            manageMode
              ? "grid-cols-[100px_100px_100px_100px_100px_140px_32px]"
              : "grid-cols-[100px_100px_100px_100px_100px_140px]"
          }`}
        >
          <span>Date</span>
          <span className="text-right">Investment</span>
          <span className="text-right">Securities</span>
          <span className="text-right">Cash</span>
          <span className="text-right">Total</span>
          <span className="text-right">P&L</span>
          {manageMode && <span />}
        </div>
        {snapshots.map((snap) => {
          const totalValue = snap.market_value + snap.cash_balance;
          const pnl = totalValue - snap.total_investment;
          const rate =
            snap.return_rate != null
              ? snap.return_rate
              : snap.total_investment > 0
                ? (pnl / snap.total_investment) * 100
                : 0;
          return (
            <div
              key={snap.id}
              className={`grid items-center gap-2 border-b py-2 text-sm ${
                manageMode
                  ? "grid-cols-[100px_100px_100px_100px_100px_140px_32px]"
                  : "grid-cols-[100px_100px_100px_100px_100px_140px]"
              }`}
            >
              <span className="font-medium">{snap.date}</span>
              <span className="text-right">{snap.total_investment.toLocaleString()}</span>
              <span className="text-right">{snap.market_value.toLocaleString()}</span>
              <span className="text-right">{snap.cash_balance.toLocaleString()}</span>
              <span className="text-right font-medium">{totalValue.toLocaleString()}</span>
              <span className={`text-right ${pnl >= 0 ? "text-green-600" : "text-red-600"}`}>
                {pnl.toLocaleString()} ({rate >= 0 ? "+" : ""}
                {rate.toFixed(1)}%)
              </span>
              {manageMode && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-destructive"
                  onClick={() => setDeleteSnapshotId(snap.id)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {showAddSnapshot && (
        <AddSnapshotModal
          portfolioId={id}
          onClose={() => setShowAddSnapshot(false)}
          onCreated={() => {
            queryClient.invalidateQueries({ queryKey: ["snapshots", id] });
            setShowAddSnapshot(false);
          }}
        />
      )}
      {deleteSnapshotId !== null && (
        <ConfirmModal
          message="Delete this snapshot?"
          onConfirm={() => deleteSnapshotMutation.mutate(deleteSnapshotId)}
          onCancel={() => setDeleteSnapshotId(null)}
        />
      )}
    </div>
  );
}
