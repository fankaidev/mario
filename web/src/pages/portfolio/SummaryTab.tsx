import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

function Metric({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number | string;
  highlight?: boolean;
}) {
  return (
    <Card className="transition-all hover:shadow-md">
      <CardContent className="p-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p
          className={`text-lg ${highlight ? "font-bold" : "font-medium"} ${typeof value === "number" && value >= 0 ? "text-green-700" : "text-red-700"}`}
        >
          {typeof value === "number" ? value.toLocaleString() : value}
        </p>
      </CardContent>
    </Card>
  );
}

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
            <Label htmlFor="snapshot-market-value">Market Value</Label>
            <Input
              id="snapshot-market-value"
              type="number"
              value={marketValue}
              onChange={(e) => setMarketValue(e.target.value)}
              placeholder="120000"
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

export function SummaryTab({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const [showAddSnapshot, setShowAddSnapshot] = useState(false);
  const [deleteSnapshotId, setDeleteSnapshotId] = useState<number | null>(null);

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
        snap.total_investment > 0
          ? ((snap.market_value - snap.total_investment) / snap.total_investment) * 100
          : 0,
    }))
    .reverse();

  if (currentSummary) {
    const today = new Date().toISOString().split("T")[0] ?? "";
    const rate =
      currentSummary.total_investment > 0
        ? (currentSummary.total_pnl / currentSummary.total_investment) * 100
        : 0;
    points.push({
      date: today,
      marketValue: Math.round(currentSummary.securities_value * 100) / 100,
      investment: currentSummary.total_investment,
      returnRate: Math.round(rate * 100) / 100,
    });
  }

  return (
    <div>
      <div className="mb-4">
        <h3 className="font-semibold">Summary</h3>
      </div>
      {s.price_updated_at && (
        <p className="mb-4 text-xs text-muted-foreground">Prices as of: {s.price_updated_at}</p>
      )}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <Metric label="Total Investment" value={s.total_investment} />
        <Metric label="Securities Value" value={s.securities_value} />
        <Metric label="Cash Balance" value={s.cash_balance} />
        <Metric label="Portfolio Value" value={s.portfolio_value} />
        <Metric label="Unrealized P&L" value={s.unrealized_pnl} />
        <Metric label="Realized P&L" value={s.realized_pnl} />
        <Metric label="Dividend Income" value={s.dividend_income} />
        <Metric label="Total P&L" value={s.total_pnl} highlight />
        <Metric label="Return Rate" value={`${s.return_rate}%`} />
      </div>
      <h4 className="mt-6 mb-2 font-semibold">Fees</h4>
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div className="flex justify-between rounded-md bg-muted p-2">
          <span>Buy Fees</span>
          <span>{s.cumulative_buy_fees}</span>
        </div>
        <div className="flex justify-between rounded-md bg-muted p-2">
          <span>Sell Fees</span>
          <span>{s.cumulative_sell_fees}</span>
        </div>
        <div className="flex justify-between rounded-md bg-muted p-2">
          <span>Withholding Tax</span>
          <span>{s.cumulative_withholding_tax}</span>
        </div>
        <div className="flex justify-between rounded-md bg-muted p-2 font-medium">
          <span>Total Fees</span>
          <span>{s.cumulative_total_fees}</span>
        </div>
      </div>

      {points.length > 0 && (
        <>
          <h3 className="mt-6 mb-4 font-semibold">Market Value Over Time</h3>
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
                formatValue={(v) => v.toLocaleString()}
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
        <Button size="sm" onClick={() => setShowAddSnapshot(true)}>
          Add Snapshot
        </Button>
      </div>
      {snapshots.length === 0 && <EmptyState message="No snapshots yet." />}
      <div className="space-y-1">
        {snapshots.map((snap) => {
          const pnl = snap.market_value - snap.total_investment;
          const rate = snap.total_investment > 0 ? (pnl / snap.total_investment) * 100 : 0;
          return (
            <div key={snap.id} className="flex items-center justify-between border-b py-2 text-sm">
              <div>
                <span className="font-medium">{snap.date}</span>
                {snap.note && <span className="ml-2 text-muted-foreground">{snap.note}</span>}
              </div>
              <div className="flex items-center gap-3">
                <span>Inv: {snap.total_investment.toLocaleString()}</span>
                <span>Mkt: {snap.market_value.toLocaleString()}</span>
                <span className={pnl >= 0 ? "text-green-600" : "text-red-600"}>
                  P&L: {pnl.toLocaleString()} ({rate >= 0 ? "+" : ""}
                  {rate.toFixed(1)}%)
                </span>
                <Button
                  variant="link"
                  className="h-auto p-0 text-xs text-destructive"
                  onClick={() => setDeleteSnapshotId(snap.id)}
                >
                  Delete
                </Button>
              </div>
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
