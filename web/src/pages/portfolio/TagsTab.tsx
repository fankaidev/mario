import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { EmptyState } from "../../components/EmptyState";
import { Input } from "../../components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { get, post, del } from "../../lib/api";
import type { Tag } from "./types";

export function TagsTab({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const [newTagName, setNewTagName] = useState("");
  const [assignSymbols, setAssignSymbols] = useState<Record<number, string>>({});

  const { data: tagsData, isLoading: tagsLoading } = useQuery({
    queryKey: ["tags", id],
    queryFn: () => get<{ data: Tag[] }>(`/portfolios/${id}/tags?include_stocks=true`),
  });

  const { data: holdingsData } = useQuery({
    queryKey: ["holdings", id, "unrealizedPnlRate"],
    queryFn: () =>
      get<{
        data: Array<{
          symbol: string;
          cost: number;
          market_value: number | null;
          unrealized_pnl: number | null;
        }>;
      }>(`/portfolios/${id}/holdings?sort=unrealizedPnlRate`),
  });

  const createMutation = useMutation({
    mutationFn: (name: string) => post<{ data: Tag }>(`/portfolios/${id}/tags`, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tags", id] });
      setNewTagName("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (tagId: number) => del<{ data: null }>(`/portfolios/${id}/tags/${tagId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tags", id] }),
  });

  const assignMutation = useMutation({
    mutationFn: ({ tagId, symbol }: { tagId: number; symbol: string }) =>
      post(`/portfolios/${id}/tags/${tagId}/stocks`, { symbol }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["tags", id] });
      setAssignSymbols((prev) => ({ ...prev, [vars.tagId]: "" }));
    },
  });

  const unassignMutation = useMutation({
    mutationFn: ({ tagId, symbol }: { tagId: number; symbol: string }) =>
      del<{ data: null }>(`/portfolios/${id}/tags/${tagId}/stocks/${encodeURIComponent(symbol)}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tags", id] }),
  });

  if (tagsLoading) return <p className="text-sm text-muted-foreground">Loading...</p>;

  const tags = tagsData?.data ?? [];
  const holdings = holdingsData?.data ?? [];

  const holdingBySymbol = new Map(holdings.map((h) => [h.symbol, h]));
  const taggedSymbols = new Set(tags.flatMap((t) => t.symbols ?? []));

  const tagAggregates = tags
    .filter((t) => t.symbols && t.symbols.length > 0)
    .map((tag) => {
      let cost = 0;
      let marketValue = 0;
      for (const symbol of tag.symbols ?? []) {
        const h = holdingBySymbol.get(symbol);
        if (h) {
          cost += h.cost;
          marketValue += h.market_value ?? 0;
        }
      }
      const pnl = marketValue - cost;
      const pnlRate = cost > 0 ? (pnl / cost) * 100 : 0;
      return { ...tag, cost, marketValue, pnl, pnlRate };
    });

  const untaggedHoldings = holdings.filter((h) => !taggedSymbols.has(h.symbol));
  const untaggedCost = untaggedHoldings.reduce((sum, h) => sum + h.cost, 0);
  const untaggedMV = untaggedHoldings.reduce((sum, h) => sum + (h.market_value ?? 0), 0);

  return (
    <div>
      <h3 className="mb-4 font-semibold">Tags</h3>

      <div className="mb-4 flex gap-2">
        <Input
          type="text"
          value={newTagName}
          onChange={(e) => setNewTagName(e.target.value)}
          placeholder="New tag name"
          className="flex-1"
          onKeyDown={(e) => {
            if (e.key === "Enter" && newTagName.trim()) {
              createMutation.mutate(newTagName.trim());
            }
          }}
        />
        <Button
          disabled={!newTagName.trim() || createMutation.isPending}
          onClick={() => createMutation.mutate(newTagName.trim())}
        >
          Add
        </Button>
      </div>

      {createMutation.error && (
        <p className="mb-3 text-sm text-destructive">{createMutation.error.message}</p>
      )}

      {tagAggregates.length > 0 && (
        <div className="mb-6">
          <h4 className="mb-2 text-sm font-semibold">Aggregated P&L by Tag</h4>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tag</TableHead>
                <TableHead>Cost</TableHead>
                <TableHead>Mkt Value</TableHead>
                <TableHead>P&L</TableHead>
                <TableHead>P&L%</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tagAggregates.map((tag) => (
                <TableRow key={tag.id}>
                  <TableCell>{tag.name}</TableCell>
                  <TableCell>{tag.cost.toLocaleString()}</TableCell>
                  <TableCell>{tag.marketValue.toLocaleString()}</TableCell>
                  <TableCell className={tag.pnl >= 0 ? "text-green-600" : "text-red-600"}>
                    {tag.pnl.toLocaleString()}
                  </TableCell>
                  <TableCell className={tag.pnlRate >= 0 ? "text-green-600" : "text-red-600"}>
                    {tag.pnlRate >= 0 ? "+" : ""}
                    {tag.pnlRate.toFixed(1)}%
                  </TableCell>
                </TableRow>
              ))}
              {untaggedHoldings.length > 0 && (
                <TableRow>
                  <TableCell className="text-muted-foreground">Untagged</TableCell>
                  <TableCell className="text-muted-foreground">
                    {untaggedCost.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {untaggedMV.toLocaleString()}
                  </TableCell>
                  <TableCell
                    className={untaggedMV - untaggedCost >= 0 ? "text-green-600" : "text-red-600"}
                  >
                    {(untaggedMV - untaggedCost).toLocaleString()}
                  </TableCell>
                  <TableCell
                    className={
                      untaggedCost > 0 && untaggedMV - untaggedCost >= 0
                        ? "text-green-600"
                        : "text-red-600"
                    }
                  >
                    {untaggedCost > 0
                      ? `${untaggedMV - untaggedCost >= 0 ? "+" : ""}${(((untaggedMV - untaggedCost) / untaggedCost) * 100).toFixed(1)}%`
                      : "-"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {tags.length === 0 && !tagAggregates.length && <EmptyState message="No tags yet." />}

      <div className="space-y-4">
        {tags.map((tag) => (
          <Card key={tag.id}>
            <CardContent className="p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-medium">{tag.name}</span>
                <Button
                  variant="link"
                  className="h-auto p-0 text-xs text-destructive"
                  onClick={() => deleteMutation.mutate(tag.id)}
                >
                  Delete
                </Button>
              </div>
              {tag.symbols && tag.symbols.length > 0 ? (
                <div className="mb-2 flex flex-wrap gap-1">
                  {tag.symbols.map((s) => (
                    <Badge key={s} variant="secondary" className="gap-1">
                      {s}
                      <button
                        className="cursor-pointer text-muted-foreground hover:text-foreground"
                        onClick={() => unassignMutation.mutate({ tagId: tag.id, symbol: s })}
                      >
                        ×
                      </button>
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="mb-2 text-xs text-muted-foreground">No stocks assigned</p>
              )}
              <div className="flex gap-1">
                <Input
                  type="text"
                  value={assignSymbols[tag.id] ?? ""}
                  onChange={(e) =>
                    setAssignSymbols((prev) => ({
                      ...prev,
                      [tag.id]: e.target.value.toUpperCase(),
                    }))
                  }
                  placeholder="Add symbol"
                  className="h-8 flex-1 text-xs"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (assignSymbols[tag.id] ?? "").trim()) {
                      assignMutation.mutate({
                        tagId: tag.id,
                        symbol: (assignSymbols[tag.id] ?? "").trim(),
                      });
                    }
                  }}
                />
                <Button
                  size="sm"
                  disabled={!(assignSymbols[tag.id] ?? "").trim() || assignMutation.isPending}
                  onClick={() =>
                    assignMutation.mutate({
                      tagId: tag.id,
                      symbol: (assignSymbols[tag.id] ?? "").trim(),
                    })
                  }
                >
                  +
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
