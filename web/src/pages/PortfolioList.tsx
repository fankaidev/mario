import { useEffect, useMemo, useState } from "react";
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
import { StackedBarChart, getPortfolioColor } from "../components/StackedBarChart";
import type { Portfolio } from "../../../shared/types/api";
import type { Snapshot } from "./portfolio/types";

export function PortfolioList() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [manageMode, setManageMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

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

  const chartData = useMemo(() => {
    if (allSnapshotData.length === 0) return [];
    const portfoliosById = new Map(portfolios.map((p) => [p.id, p]));
    const byDate = new Map<string, Array<{ label: string; value: number; color: string }>>();
    for (const snap of allSnapshotData) {
      if (!byDate.has(snap.date)) {
        byDate.set(snap.date, []);
      }
      const p = portfoliosById.get(snap.portfolio_id);
      if (!p) continue;
      const idx = portfolios.findIndex((pf) => pf.id === p.id);
      byDate.get(snap.date)!.push({
        label: p.name,
        value: snap.market_value,
        color: getPortfolioColor(idx),
      });
    }
    const sortedDates = [...byDate.keys()].sort();
    return sortedDates.map((date) => ({
      label: date,
      segments: byDate.get(date) ?? [],
    }));
  }, [allSnapshotData, portfolios]);

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
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">Portfolios</h1>
          <p className="mt-1 text-sm text-muted-foreground">Track assets by market and currency.</p>
        </div>
        <div className="flex gap-2">
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
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" />
            New Portfolio
          </Button>
        </div>
      </div>

      {!manageMode && portfolios.length > 0 && chartData.length > 0 && (
        <div className="mb-6">
          <div className="mb-3 flex flex-wrap items-center gap-1">
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
          <Card>
            <CardContent className="p-4">
              <h3 className="mb-3 text-sm font-semibold">Assets Over Time</h3>
              <StackedBarChart
                data={chartData}
                height={250}
                formatValue={(v) => v.toLocaleString()}
              />
            </CardContent>
          </Card>
        </div>
      )}

      {data?.data.length === 0 && !manageMode && (
        <EmptyState message="No portfolios yet. Create one to get started." />
      )}

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
                  <Trash2 className="h-4 w-4" />
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
                  <p className="text-xs text-muted-foreground">
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
