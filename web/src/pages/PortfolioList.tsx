import { useEffect, useMemo, useState } from "react";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Plus, Trash2, RotateCcw, Wrench } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { EmptyState } from "../components/EmptyState";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select } from "../components/ui/select";
import { get, post, del } from "../lib/api";
import { StackedBarChart, getPortfolioColor } from "../components/charts";
import type {
  AggregatedChartPoint,
  AggregatedPerformance,
  Portfolio,
} from "../../../shared/types/api";

export function PortfolioList() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [manageMode, setManageMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [selectionInitialized, setSelectionInitialized] = useState(false);
  const [chartRange, setChartRange] = useState<"1M" | "3M" | "6M" | "YTD" | "1Y" | "ALL">("ALL");
  const [targetCurrency, setTargetCurrency] = useLocalStorage<"USD" | "HKD" | "CNY">(
    "portfolio-currency",
    "USD",
  );

  const { data, isLoading, error } = useQuery({
    queryKey: ["portfolios"],
    queryFn: () => get<{ data: Portfolio[] }>("/portfolios"),
  });

  const portfolios = data?.data ?? [];
  const allMode = selectionInitialized && selectedIds.size === 0;

  useEffect(() => {
    if (!selectionInitialized && portfolios.length > 0) {
      setSelectionInitialized(true);
    }
  }, [portfolios.length, selectionInitialized]);

  const { data: performanceData, isLoading: perfLoading } = useQuery({
    queryKey: ["performance", chartRange, targetCurrency],
    queryFn: () =>
      get<{ data: AggregatedPerformance }>(
        `/performance?range=${chartRange}&currency=${targetCurrency}`,
      ),
    staleTime: 60 * 1000,
  });

  const selectedIdsStr = allMode ? "" : [...selectedIds].join(",");

  const { data: chartDataResponse } = useQuery({
    queryKey: ["performance-chart", chartRange, targetCurrency, selectedIdsStr],
    queryFn: () =>
      get<{ data: AggregatedChartPoint[] }>(
        `/performance/chart?range=${chartRange}&currency=${targetCurrency}&portfolio_ids=${selectedIdsStr}`,
      ),
    staleTime: 5 * 60 * 1000,
  });

  const chartData = useMemo(() => {
    const points = chartDataResponse?.data ?? [];
    return points.map((p) => ({
      label: p.date,
      segments: [{ label: "Total", value: p.total_value, color: "#2563eb" }],
    }));
  }, [chartDataResponse]);

  const togglePortfolio = (id: number) => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return new Set([id]);

      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleAllPortfolios = () => {
    setSelectedIds(new Set());
  };

  const { data: trashData } = useQuery({
    queryKey: ["portfolios", "trash"],
    queryFn: () => get<{ data: Portfolio[] }>("/portfolios?include_deleted=true"),
    enabled: manageMode,
  });

  const deletedPortfolios = (trashData?.data ?? []).filter((p) => p.deleted_at !== null);

  const createMutation = useMutation({
    mutationFn: (body: { name: string; currency: string }) =>
      post<{ data: Portfolio }>("/portfolios", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portfolios"] });
      setShowCreate(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => del<{ data: { message: string } }>(`/portfolios/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portfolios"] });
      queryClient.invalidateQueries({ queryKey: ["portfolios", "trash"] });
      setDeleteId(null);
    },
  });

  const restoreMutation = useMutation({
    mutationFn: (id: number) => post<{ data: Portfolio }>(`/portfolios/${id}/restore`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portfolios"] });
      queryClient.invalidateQueries({ queryKey: ["portfolios", "trash"] });
    },
  });

  if (isLoading) return <p className="p-4 text-sm text-muted-foreground">Loading...</p>;
  if (error) return <p className="p-4 text-destructive">Failed to load portfolios</p>;

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-normal">Portfolios</h1>
        <p className="mt-1 text-sm text-muted-foreground">Track assets by market and currency.</p>
      </div>

      {portfolios.length > 0 && !perfLoading && performanceData?.data && (
        <div className="mb-6">
          <Card>
            <CardContent className="p-4">
              <h3 className="mb-3 text-sm font-semibold">
                Total Wealth ({performanceData.data.target_currency})
                {chartRange !== "ALL" && (
                  <span className="ml-1 text-xs text-muted-foreground">— {chartRange} range</span>
                )}
              </h3>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Portfolio Value</p>
                  <p className="tabular-nums text-base font-medium">
                    {Math.round(performanceData.data.end_value).toLocaleString()}{" "}
                    {performanceData.data.target_currency}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Net Investment</p>
                  <p className="tabular-nums text-base font-medium">
                    {Math.round(
                      performanceData.data.start_value + performanceData.data.net_cash_flow,
                    ).toLocaleString()}{" "}
                    {performanceData.data.target_currency}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">P&amp;L</p>
                  <p
                    className={`tabular-nums text-base font-medium ${performanceData.data.pnl >= 0 ? "text-green-700" : "text-red-700"}`}
                  >
                    {Math.round(performanceData.data.pnl).toLocaleString()}{" "}
                    {performanceData.data.target_currency}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Return Rate</p>
                  <p
                    className={`tabular-nums text-base font-medium ${performanceData.data.return_rate >= 0 ? "text-green-700" : "text-red-700"}`}
                  >
                    {performanceData.data.return_rate}%
                  </p>
                </div>
              </div>
              {performanceData.data.exchange_rate_updated_at && (
                <p className="mt-2 text-right text-xs text-muted-foreground">
                  Exchange rates as of: {performanceData.data.exchange_rate_updated_at}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {portfolios.length > 0 && (
        <div className="mb-6">
          <div className="mb-3 space-y-2">
            <div className="flex flex-wrap items-start gap-1.5">
              <Button
                size="sm"
                variant="outline"
                className={`h-7 gap-1.5 rounded-md px-2.5 text-xs ${allMode ? "border-foreground bg-background text-foreground shadow-sm" : "border-border bg-background text-muted-foreground hover:text-foreground"}`}
                onClick={toggleAllPortfolios}
              >
                {allMode && <Check className="h-3 w-3" />}
                All
              </Button>
              {portfolios.map((p, i) => {
                const selected = selectedIds.has(p.id);
                return (
                  <Button
                    key={p.id}
                    size="sm"
                    variant="outline"
                    className={`h-7 gap-1.5 rounded-md px-2.5 text-xs ${selected ? "border-foreground bg-background text-foreground shadow-sm" : "border-border bg-background text-muted-foreground hover:text-foreground"}`}
                    onClick={() => togglePortfolio(p.id)}
                  >
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: getPortfolioColor(i) }}
                    />
                    {selected && <Check className="h-3 w-3" />}
                    {p.name}
                  </Button>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex rounded-md border border-input bg-background p-0.5">
                {(["1M", "3M", "6M", "YTD", "1Y", "ALL"] as const).map((r) => (
                  <Button
                    key={r}
                    size="sm"
                    variant="ghost"
                    className={`h-7 rounded-sm px-3 text-xs ${chartRange === r ? "bg-foreground text-background hover:bg-foreground hover:text-background" : "text-muted-foreground hover:text-foreground"}`}
                    onClick={() => setChartRange(r)}
                  >
                    {r}
                  </Button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <div className="inline-flex rounded-md border border-input bg-background p-0.5">
                  {(["USD", "HKD", "CNY"] as const).map((c) => (
                    <Button
                      key={c}
                      size="sm"
                      variant="ghost"
                      className={`h-7 rounded-sm px-3 text-xs ${targetCurrency === c ? "bg-foreground text-background hover:bg-foreground hover:text-background" : "text-muted-foreground hover:text-foreground"}`}
                      onClick={() => setTargetCurrency(c)}
                    >
                      {c}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </div>
          {chartData.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <h3 className="mb-3 text-sm font-semibold">
                  Portfolio Value Over Time ({targetCurrency})
                </h3>
                <StackedBarChart
                  data={chartData}
                  height={250}
                  formatValue={(v) => `${Math.round(v / 1000).toLocaleString()} K`}
                />
              </CardContent>
            </Card>
          )}
          {chartData.length === 0 && (
            <Card>
              <CardContent className="p-4">
                <EmptyState message="No chart data available." />
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {data?.data.length === 0 && (
        <EmptyState message="No portfolios yet. Create one to get started." />
      )}

      <div className="mb-4 flex items-center justify-end gap-2">
        {data?.data.length !== 0 && (
          <Button variant="outline" onClick={() => setManageMode(!manageMode)}>
            {manageMode ? (
              <>
                <Check className="h-4 w-4" />
                Done
              </>
            ) : (
              <>
                <Wrench className="h-4 w-4" />
                Manage
              </>
            )}
          </Button>
        )}
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" />
          New Portfolio
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {data?.data.map((p) =>
          manageMode ? (
            <Card key={p.id} className="h-full">
              <CardHeader className="flex-row items-start justify-between space-y-0">
                <div>
                  <CardTitle>{p.name}</CardTitle>
                  <CardDescription>{p.currency}</CardDescription>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => setDeleteId(p.id)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  Created {new Date(p.created_at).toLocaleDateString()}
                </p>
              </CardContent>
            </Card>
          ) : (
            <Link key={p.id} to={`/portfolios/${p.id}`}>
              <Card className="h-full cursor-pointer transition-all hover:shadow-md">
                <CardHeader>
                  <CardTitle>{p.name}</CardTitle>
                  <CardDescription>{p.currency}</CardDescription>
                </CardHeader>
                <CardContent>
                  {performanceData?.data &&
                    (() => {
                      const pp = performanceData.data.portfolios.find(
                        (ap) => ap.portfolio_id === p.id,
                      );
                      if (!pp) return null;
                      return (
                        <div>
                          <p className="tabular-nums text-sm font-semibold">
                            {Math.round(pp.end_value).toLocaleString()} {pp.native_currency}
                          </p>
                        </div>
                      );
                    })()}
                  <p className="mt-1 text-xs text-muted-foreground">
                    Created {new Date(p.created_at).toLocaleDateString()}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ),
        )}
      </div>

      {manageMode && (
        <div className="mt-8">
          <h2 className="mb-4 text-lg font-semibold">Trash</h2>
          {deletedPortfolios.length === 0 ? (
            <EmptyState message="No deleted portfolios." />
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {deletedPortfolios.map((p) => (
                <Card key={p.id} className="h-full opacity-70">
                  <CardHeader className="flex-row items-start justify-between space-y-0">
                    <div>
                      <CardTitle>{p.name}</CardTitle>
                      <CardDescription>{p.currency}</CardDescription>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-muted-foreground hover:text-green-600"
                      onClick={() => restoreMutation.mutate(p.id)}
                      disabled={restoreMutation.isPending}
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground">
                      Deleted {p.deleted_at ? new Date(p.deleted_at).toLocaleDateString() : ""}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {showCreate && (
        <CreatePortfolioModal
          onClose={() => setShowCreate(false)}
          onCreate={(name, currency) => createMutation.mutate({ name, currency })}
          error={createMutation.error ? createMutation.error.message : undefined}
        />
      )}
      {deleteId !== null && (
        <Dialog open onOpenChange={(open) => !open && setDeleteId(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Delete Portfolio</DialogTitle>
              <DialogDescription>
                This portfolio will be moved to trash. You can restore it later.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteId(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => deleteMutation.mutate(deleteId)}
                disabled={deleteMutation.isPending}
              >
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function CreatePortfolioModal({
  onClose,
  onCreate,
  error,
}: {
  onClose: () => void;
  onCreate: (name: string, currency: string) => void;
  error: string | undefined;
}) {
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("USD");

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Portfolio</DialogTitle>
        </DialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="grid gap-2">
          <Label htmlFor="portfolio-name">Name</Label>
          <Input
            id="portfolio-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Portfolio"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="portfolio-currency">Currency</Label>
          <Select
            id="portfolio-currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          >
            <option value="USD">USD</option>
            <option value="HKD">HKD</option>
            <option value="CNY">CNY</option>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!name.trim()} onClick={() => onCreate(name.trim(), currency)}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
