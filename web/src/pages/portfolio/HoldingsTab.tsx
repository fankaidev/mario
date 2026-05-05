import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { EmptyState } from "../../components/EmptyState";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "../../components/ui/table";
import { get } from "../../lib/api";
import { SortableTh, type SortState } from "../../components/SortableTh";
import type { Holding, SortField, Tag } from "./types";
import { HoldingDetailPanel } from "./HoldingDetailPanel";

function LotDetailsRow({
  id,
  holding,
  isExpanded,
  onToggle,
  symbolTags,
  totalMarketValue,
  onSelectSymbol,
}: {
  id: string;
  holding: Holding;
  isExpanded: boolean;
  onToggle: () => void;
  symbolTags: Map<string, Array<{ id: number; name: string }>>;
  totalMarketValue: number;
  onSelectSymbol?: ((symbol: string) => void) | undefined;
}) {
  return (
    <>
      <TableRow className="cursor-pointer" onClick={onToggle}>
        <TableCell>
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">{isExpanded ? "▼" : "▶"}</span>
            {onSelectSymbol ? (
              <Button
                variant="link"
                className="h-auto p-0 font-medium"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectSymbol(holding.symbol);
                }}
              >
                {holding.symbol}
              </Button>
            ) : (
              <span className="font-medium">{holding.symbol}</span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">{holding.name}</div>
          {symbolTags.has(holding.symbol) && (
            <div className="mt-0.5 flex flex-wrap gap-0.5">
              {symbolTags.get(holding.symbol)!.map((tag) => (
                <Badge key={tag.id} variant="secondary">
                  {tag.name}
                </Badge>
              ))}
            </div>
          )}
        </TableCell>
        <TableCell className="text-right tabular-nums">{holding.quantity}</TableCell>
        <TableCell className="text-right tabular-nums">
          {(holding.cost / holding.quantity).toFixed(3)}
        </TableCell>
        <TableCell className="text-right tabular-nums">
          {holding.price?.toFixed(3) ?? "-"}
        </TableCell>
        <TableCell className="text-right tabular-nums">
          {holding.market_value != null ? Math.round(holding.market_value).toLocaleString() : "-"}
        </TableCell>
        <TableCell
          className={`text-right tabular-nums ${(holding.unrealized_pnl ?? 0) >= 0 ? "text-green-600" : "text-red-600"}`}
        >
          {holding.unrealized_pnl != null
            ? Math.round(holding.unrealized_pnl).toLocaleString()
            : "-"}
        </TableCell>
        <TableCell
          className={`text-right tabular-nums ${(holding.unrealized_pnl_rate ?? 0) >= 0 ? "text-green-600" : "text-red-600"}`}
        >
          {holding.unrealized_pnl_rate != null ? `${holding.unrealized_pnl_rate.toFixed(1)}%` : "-"}
        </TableCell>
        <TableCell className="text-right tabular-nums text-muted-foreground">
          {totalMarketValue > 0
            ? `${(((holding.market_value ?? 0) / totalMarketValue) * 100).toFixed(1)}%`
            : "-"}
        </TableCell>
      </TableRow>
      {isExpanded && (
        <TableRow>
          <TableCell colSpan={8} className="bg-muted/50 px-4 py-2">
            <HoldingDetailPanel id={id} symbol={holding.symbol} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function MobileLotDetailsCard({
  id,
  holding,
  isExpanded,
  onToggle,
  symbolTags,
  totalMarketValue,
  onSelectSymbol,
}: {
  id: string;
  holding: Holding;
  isExpanded: boolean;
  onToggle: () => void;
  symbolTags: Map<string, Array<{ id: number; name: string }>>;
  totalMarketValue: number;
  onSelectSymbol?: ((symbol: string) => void) | undefined;
}) {
  return (
    <Card className="transition-all hover:shadow-md">
      <CardContent className="cursor-pointer p-4" onClick={onToggle}>
        <div className="mb-2 flex items-center justify-between">
          <div>
            <span className="mr-1 text-xs text-muted-foreground">{isExpanded ? "▼" : "▶"}</span>
            {onSelectSymbol ? (
              <Button
                variant="link"
                className="h-auto p-0 font-semibold"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectSymbol(holding.symbol);
                }}
              >
                {holding.symbol}
              </Button>
            ) : (
              <span className="font-semibold">{holding.symbol}</span>
            )}
            <div className="text-xs text-muted-foreground">{holding.name}</div>
            {symbolTags.has(holding.symbol) && (
              <div className="mt-0.5 flex flex-wrap gap-0.5">
                {symbolTags.get(holding.symbol)!.map((tag) => (
                  <Badge key={tag.id} variant="secondary">
                    {tag.name}
                  </Badge>
                ))}
              </div>
            )}
          </div>
          <span className="text-sm text-muted-foreground">{holding.quantity} shares</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">
            Avg Cost: {(holding.cost / holding.quantity).toFixed(3)}
          </span>
          <span className="text-muted-foreground">
            {totalMarketValue > 0
              ? `${(((holding.market_value ?? 0) / totalMarketValue) * 100).toFixed(1)}%`
              : "-"}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">
            Mkt Value:{" "}
            {holding.market_value != null ? Math.round(holding.market_value).toLocaleString() : "-"}
          </span>
          <span
            className={
              holding.unrealized_pnl != null && holding.unrealized_pnl >= 0
                ? "text-green-600"
                : "text-red-600"
            }
          >
            P&L:{" "}
            {holding.unrealized_pnl != null
              ? Math.round(holding.unrealized_pnl).toLocaleString()
              : "-"}{" "}
            (
            {holding.unrealized_pnl_rate != null
              ? `${holding.unrealized_pnl_rate.toFixed(1)}%`
              : "-"}
            )
          </span>
        </div>
      </CardContent>
      {isExpanded && (
        <div className="border-t bg-muted/50 px-3 py-2">
          <HoldingDetailPanel id={id} symbol={holding.symbol} />
        </div>
      )}
    </Card>
  );
}

export function HoldingsTab({
  id,
  onSelectSymbol,
}: {
  id: string;
  onSelectSymbol?: ((symbol: string) => void) | undefined;
}) {
  const [sort, setSort] = useState<SortState<SortField>>({
    field: "unrealizedPnlRate",
    direction: "desc",
  });
  const [tagFilter, setTagFilter] = useState<number | null>(null);
  const [expandedSymbols, setExpandedSymbols] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery({
    queryKey: ["holdings", id],
    queryFn: () => get<{ data: Holding[] }>(`/portfolios/${id}/holdings`),
  });

  const { data: tagsData } = useQuery({
    queryKey: ["tags", id],
    queryFn: () => get<{ data: Tag[] }>(`/portfolios/${id}/tags?include_stocks=true`),
  });

  const tags = tagsData?.data ?? [];
  const symbolTags = (() => {
    const map = new Map<string, Array<{ id: number; name: string }>>();
    for (const tag of tags) {
      for (const symbol of tag.symbols ?? []) {
        const list = map.get(symbol) ?? [];
        list.push({ id: tag.id, name: tag.name });
        map.set(symbol, list);
      }
    }
    return map;
  })();

  const filteredTagSymbols = new Set(
    tagFilter !== null ? (tags.find((t) => t.id === tagFilter)?.symbols ?? []) : [],
  );

  const sortedHoldings = useMemo(() => {
    let holdings = data?.data ?? [];
    if (tagFilter !== null) {
      holdings = holdings.filter((h) => filteredTagSymbols.has(h.symbol));
    }
    const { field, direction } = sort;

    return [...holdings].sort((a, b) => {
      let aVal: number | string | null;
      let bVal: number | string | null;

      switch (field) {
        case "symbol":
          aVal = a.symbol;
          bVal = b.symbol;
          break;
        case "quantity":
          aVal = a.quantity;
          bVal = b.quantity;
          break;
        case "cost":
          aVal = a.quantity > 0 ? a.cost / a.quantity : null;
          bVal = b.quantity > 0 ? b.cost / b.quantity : null;
          break;
        case "price":
          aVal = a.price;
          bVal = b.price;
          break;
        case "marketValue":
          aVal = a.market_value;
          bVal = b.market_value;
          break;
        case "weight":
          aVal = a.market_value;
          bVal = b.market_value;
          break;
        case "unrealizedPnl":
          aVal = a.unrealized_pnl;
          bVal = b.unrealized_pnl;
          break;
        case "unrealizedPnlRate":
          aVal = a.unrealized_pnl_rate;
          bVal = b.unrealized_pnl_rate;
          break;
      }

      if (aVal === null && bVal === null) return 0;
      if (aVal === null) return 1;
      if (bVal === null) return -1;

      const cmp =
        typeof aVal === "string" && typeof bVal === "string"
          ? aVal.localeCompare(bVal)
          : (aVal as number) - (bVal as number);

      return direction === "desc" ? -cmp : cmp;
    });
  }, [data?.data, sort, tagFilter, filteredTagSymbols]);

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading...</p>;

  const totalMarketValue = sortedHoldings.reduce((sum, h) => sum + (h.market_value ?? 0), 0);

  return (
    <div>
      {tags.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1">
          <Button
            size="sm"
            variant={tagFilter === null ? "default" : "secondary"}
            onClick={() => setTagFilter(null)}
          >
            All
          </Button>
          {tags.map((tag) => (
            <Button
              key={tag.id}
              size="sm"
              variant={tagFilter === tag.id ? "default" : "secondary"}
              onClick={() => setTagFilter(tag.id === tagFilter ? null : tag.id)}
            >
              {tag.name}
            </Button>
          ))}
        </div>
      )}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableTh label="Symbol" field="symbol" sort={sort} onSort={setSort} />
              <SortableTh label="Qty" field="quantity" sort={sort} onSort={setSort} align="right" />
              <SortableTh
                label="Avg Cost"
                field="cost"
                sort={sort}
                onSort={setSort}
                align="right"
              />
              <SortableTh label="Price" field="price" sort={sort} onSort={setSort} align="right" />
              <SortableTh
                label="Mkt Value"
                field="marketValue"
                sort={sort}
                onSort={setSort}
                align="right"
              />
              <SortableTh
                label="P&amp;L"
                field="unrealizedPnl"
                sort={sort}
                onSort={setSort}
                align="right"
              />
              <SortableTh
                label="P&amp;L%"
                field="unrealizedPnlRate"
                sort={sort}
                onSort={setSort}
                align="right"
              />
              <SortableTh
                label="Weight%"
                field="weight"
                sort={sort}
                onSort={setSort}
                align="right"
              />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedHoldings.map((h) => (
              <LotDetailsRow
                id={id}
                key={h.symbol}
                holding={h}
                isExpanded={expandedSymbols.has(h.symbol)}
                onToggle={() =>
                  setExpandedSymbols((prev) => {
                    const next = new Set(prev);
                    if (next.has(h.symbol)) {
                      next.delete(h.symbol);
                    } else {
                      next.add(h.symbol);
                    }
                    return next;
                  })
                }
                symbolTags={symbolTags}
                totalMarketValue={totalMarketValue}
                onSelectSymbol={onSelectSymbol}
              />
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-2 md:hidden">
        {sortedHoldings.map((h) => (
          <MobileLotDetailsCard
            id={id}
            key={h.symbol}
            holding={h}
            isExpanded={expandedSymbols.has(h.symbol)}
            onToggle={() =>
              setExpandedSymbols((prev) => {
                const next = new Set(prev);
                if (next.has(h.symbol)) {
                  next.delete(h.symbol);
                } else {
                  next.add(h.symbol);
                }
                return next;
              })
            }
            symbolTags={symbolTags}
            totalMarketValue={totalMarketValue}
            onSelectSymbol={onSelectSymbol}
          />
        ))}
      </div>

      {sortedHoldings.length === 0 && <EmptyState message="No holdings" />}
    </div>
  );
}
