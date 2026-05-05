import { useEffect, useMemo, useState } from "react";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
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
import type { AggregatedSummary, ExchangeRateRecord, Portfolio } from "../../../shared/types/api";
import type { Snapshot } from "./portfolio/types";

export function PortfolioList() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [manageMode, setManageMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [chartRange, setChartRange] = useState<"1M" | "3M" | "6M" | "YTD" | "1Y" | "ALL">("1Y");
  const [targetCurrency, setTargetCurrency] = useLocalStorage<"USD" | "HKD" | "CNY">(
    "portfolio-currency",
    "USD",
  );

  const { data, isLoading, error } = useQuery({
    queryKey: ["portfolios"],
    queryFn: () => get<{ data: Portfolio[] }>("/portfolios"),
  });

  const portfolios = data?.data ?? [];

  useEffect(() => {
    if (portfolios.length > 0 && selectedIds.size === 0) {
      setSelectedIds(new Set(portfolios.map((p) => p.id)));
    }
  }, [portfolios, selectedIds.size]);

  const { data: aggregatedSummary, isLoading: aggLoading } = useQuery({
    queryKey: ["summary", targetCurrency],
    queryFn: () => get<{ data: AggregatedSummary }>(`/summary?currency=${targetCurrency}`),
    staleTime: 60 * 1000,
  });

  const { data: exchangeRatesData } = useQuery({
    queryKey: ["exchangeRates"],
    queryFn: () => get<{ data: ExchangeRateRecord[] }>("/exchange-rates"),
    staleTime: 5 * 60 * 1000,
  });

  const rateLookup = useMemo(() => {
    const rates = exchangeRatesData?.data ?? [];
    // Build map: fromCurrency -> toCurrency -> sorted array of { date, rate }
    const map = new Map<string, Array<{ date: string; rate: number }>>();
    for (const r of rates) {
      const key = `${r.from_currency}->${r.to_currency}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push({ date: r.date, rate: r.rate });
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => a.date.localeCompare(b.date));
    }
    return map;
  }, [exchangeRatesData]);

  function findRate(from: string, to: string, date: string): number | null {
    if (from === to) return 1;

    // Try direct rate at or before the snapshot date
    const directKey = `${from}->${to}`;
    const directRates = rateLookup.get(directKey);
    const direct = findNearestRate(directRates, date);
    if (direct !== null) return direct;

    // Try inverse rate
    const inverseKey = `${to}->${from}`;
    const inverseRates = rateLookup.get(inverseKey);
    const inverse = findNearestRate(inverseRates, date);
    if (inverse !== null) return 1 / inverse;

    // Try cross-rate via USD for HKD↔CNY
    // Try both directions since rates may be stored as USD→X or X→USD
    if (from !== "USD" && to !== "USD") {
      let fromToUsd = findNearestRate(rateLookup.get(`${from}->USD`), date);
      if (fromToUsd === null) {
        const inv = findNearestRate(rateLookup.get(`USD->${from}`), date);
        fromToUsd = inv !== null ? 1 / inv : null;
      }
      let toToUsd = findNearestRate(rateLookup.get(`${to}->USD`), date);
      if (toToUsd === null) {
        const inv = findNearestRate(rateLookup.get(`USD->${to}`), date);
        toToUsd = inv !== null ? 1 / inv : null;
      }
      if (fromToUsd !== null && toToUsd !== null) return fromToUsd / toToUsd;
    }

    return null;
  }

  function findNearestRate(
    rates: Array<{ date: string; rate: number }> | undefined,
    targetDate: string,
  ): number | null {
    if (!rates || rates.length === 0) return null;
    // Find the last rate on or before the target date
    let best: { date: string; rate: number } | null = null;
    for (const r of rates) {
      if (r.date <= targetDate) {
        best = r;
      } else {
        break;
      }
    }
    return best?.rate ?? null;
  }

  const snapshotQueries = useQueries({
    queries: portfolios
      .filter((p) => selectedIds.has(p.id))
      .map((p) => ({
        queryKey: ["snapshots", p.id] as const,
        queryFn: () => get<{ data: Snapshot[] }>(`/portfolios/${p.id}/snapshots`),
        staleTime: 5 * 60 * 1000,
      })),
  });

  const selectedPortfolios = portfolios.filter((p) => selectedIds.has(p.id));

  const allSnapshotData: Array<Snapshot & { portfolio_id: number }> = snapshotQueries
    .map((q, i) => {
      const pId = selectedPortfolios[i]?.id;
      if (!pId || !q.data?.data) return [];
      return q.data.data.map((s) => ({ ...s, portfolio_id: pId }));
    })
    .flat();

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

  const chartData = useMemo(() => {
    if (allSnapshotData.length === 0) return [];
    const portfoliosById = new Map(portfolios.map((p) => [p.id, p]));

    // Build a map of portfolio_id -> sorted snapshots
    const snapshotsByPortfolio = new Map<number, Array<Snapshot & { portfolio_id: number }>>();
    for (const snap of allSnapshotData) {
      if (!snapshotsByPortfolio.has(snap.portfolio_id)) {
        snapshotsByPortfolio.set(snap.portfolio_id, []);
      }
      snapshotsByPortfolio.get(snap.portfolio_id)!.push(snap);
    }
    // Sort each portfolio's snapshots by date
    for (const [_, snaps] of snapshotsByPortfolio) {
      snaps.sort((a, b) => a.date.localeCompare(b.date));
    }

    // Collect all unique dates across all portfolios (filter by cutoff)
    const allDates = new Set<string>();
    for (const snap of allSnapshotData) {
      if (!chartCutoff || snap.date >= chartCutoff) {
        allDates.add(snap.date);
      }
    }
    const sortedDates = [...allDates].sort();

    // For each date, get value for each portfolio (forward-fill if missing)
    return sortedDates.map((date) => {
      const segments: Array<{ label: string; value: number; color: string }> = [];
      for (const [portfolioId, snaps] of snapshotsByPortfolio) {
        const p = portfoliosById.get(portfolioId);
        if (!p) continue;

        // Find the last snapshot on or before this date
        let lastSnap: (Snapshot & { portfolio_id: number }) | undefined;
        for (const snap of snaps) {
          if (snap.date <= date) {
            lastSnap = snap;
          } else {
            break;
          }
        }

        if (lastSnap) {
          const rate = findRate(p.currency, targetCurrency, date);
          if (rate !== null) {
            const idx = portfolios.findIndex((pf) => pf.id === p.id);
            segments.push({
              label: p.name,
              value: (lastSnap.market_value + lastSnap.cash_balance) * rate,
              color: getPortfolioColor(idx),
            });
          }
        }
      }
      return {
        label: date,
        segments,
      };
    });
  }, [allSnapshotData, portfolios, chartCutoff, targetCurrency, rateLookup]);

  const togglePortfolio = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
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

      {portfolios.length > 0 && !aggLoading && aggregatedSummary?.data && (
        <div className="mb-6">
          <Card>
            <CardContent className="p-4">
              <h3 className="mb-3 text-sm font-semibold">
                Total Wealth ({aggregatedSummary.data.target_currency})
              </h3>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Portfolio Value</p>
                  <p className="tabular-nums text-base font-medium">
                    {Math.round(aggregatedSummary.data.portfolio_value).toLocaleString()}{" "}
                    {aggregatedSummary.data.target_currency}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Total Investment</p>
                  <p className="tabular-nums text-base font-medium">
                    {Math.round(aggregatedSummary.data.total_investment).toLocaleString()}{" "}
                    {aggregatedSummary.data.target_currency}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Total P&amp;L</p>
                  <p
                    className={`tabular-nums text-base font-medium ${aggregatedSummary.data.total_pnl >= 0 ? "text-green-700" : "text-red-700"}`}
                  >
                    {Math.round(aggregatedSummary.data.total_pnl).toLocaleString()}{" "}
                    {aggregatedSummary.data.target_currency}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Return Rate</p>
                  <p
                    className={`tabular-nums text-base font-medium ${aggregatedSummary.data.return_rate >= 0 ? "text-green-700" : "text-red-700"}`}
                  >
                    {aggregatedSummary.data.return_rate}%
                  </p>
                </div>
              </div>
              {aggregatedSummary.data.exchange_rate_updated_at && (
                <p className="mt-2 text-right text-xs text-muted-foreground">
                  Exchange rates as of: {aggregatedSummary.data.exchange_rate_updated_at}
                </p>
              )}
              {!aggregatedSummary.data.exchange_rate_updated_at &&
                aggregatedSummary.data.portfolios.some((p) => p.converted_summary === null) && (
                  <p className="mt-2 text-right text-xs text-muted-foreground">
                    Some portfolios excluded: exchange rates not yet available
                  </p>
                )}
            </CardContent>
          </Card>
        </div>
      )}

      {portfolios.length > 0 && chartData.length > 0 && (
        <div className="mb-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1">
              {portfolios.map((p, i) => (
                <Button
                  key={p.id}
                  size="sm"
                  variant={selectedIds.has(p.id) ? "default" : "outline"}
                  className="h-6 px-2 text-xs"
                  onClick={() => togglePortfolio(p.id)}
                >
                  <span
                    className="mr-1 inline-block h-2 w-2 rounded-full"
                    style={{
                      backgroundColor: selectedIds.has(p.id) ? "#fff" : getPortfolioColor(i),
                    }}
                  />
                  {p.name}
                </Button>
              ))}
            </div>
            <div className="flex items-center gap-1">
              <span className="mr-1 text-xs text-muted-foreground">Currency:</span>
              {(["USD", "HKD", "CNY"] as const).map((c) => (
                <Button
                  key={c}
                  size="sm"
                  variant={targetCurrency === c ? "default" : "outline"}
                  className="h-6 px-2 text-xs"
                  onClick={() => setTargetCurrency(c)}
                >
                  {c}
                </Button>
              ))}
            </div>
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
                  {aggregatedSummary?.data &&
                    (() => {
                      const ps = aggregatedSummary.data.portfolios.find(
                        (ap) => ap.portfolio_id === p.id,
                      );
                      if (!ps?.native_summary) return null;
                      const nativeValue = ps.native_summary.portfolio_value;
                      const convertedValue = ps.converted_summary?.portfolio_value;
                      const showConverted =
                        convertedValue !== undefined &&
                        convertedValue !== null &&
                        p.currency !== targetCurrency;
                      return (
                        <div>
                          <p className="tabular-nums text-sm font-semibold">
                            {Math.round(nativeValue).toLocaleString()} {p.currency}
                          </p>
                          {showConverted && (
                            <p className="tabular-nums text-xs text-muted-foreground">
                              ≈ {Math.round(convertedValue).toLocaleString()} {targetCurrency}
                            </p>
                          )}
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
