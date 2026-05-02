import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "react-router-dom";
import { LineChart } from "../components/LineChart";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { Switch } from "../components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "../components/ui/tabs";
import { get, post, del } from "../lib/api";
import type {
  HoldingLots,
  PortfolioSummary,
  PriceHistoryResponse,
  Transaction,
} from "../../../shared/types/api";

interface Tag {
  id: number;
  name: string;
  symbols?: string[];
}

interface Holding {
  symbol: string;
  name: string;
  quantity: number;
  cost: number;
  price: number | null;
  market_value: number | null;
  unrealized_pnl: number | null;
  unrealized_pnl_rate: number | null;
}

type Summary = PortfolioSummary;

interface Snapshot {
  id: number;
  date: string;
  total_investment: number;
  market_value: number;
  note: string | null;
}

interface Transfer {
  id: number;
  type: "deposit" | "withdrawal";
  amount: number;
  fee: number;
  date: string;
  note: string | null;
}

interface Portfolio {
  id: number;
  name: string;
  currency: string;
}

type TabName =
  | "holdings"
  | "transactions"
  | "transfers"
  | "snapshots"
  | "return"
  | "summary"
  | "tags";

export function PortfolioDetail() {
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState<TabName>("holdings");
  const [symbolFilter, setSymbolFilter] = useState("");

  const { data: portfolioData } = useQuery({
    queryKey: ["portfolio", id],
    queryFn: () => get<{ data: Portfolio }>(`/portfolios/${id}`),
  });

  const portfolio = portfolioData?.data;

  return (
    <div className="min-h-screen bg-muted/40">
      <div className="mx-auto max-w-5xl p-4 md:p-6">
        <Button asChild variant="link" className="h-auto p-0">
          <Link to="/">Back to Portfolios</Link>
        </Button>
        <h1 className="mb-4 text-xl font-semibold md:text-2xl">
          {portfolio ? `${portfolio.name} (${portfolio.currency})` : "Loading..."}
        </h1>

        <SummaryCard id={id!} />

        <Tabs value={tab} onValueChange={(value) => setTab(value as TabName)} className="mt-6">
          <TabsList className="mb-4 w-full justify-start overflow-x-auto">
            {(
              [
                ["holdings", "Holdings"],
                ["transactions", "Transactions"],
                ["transfers", "Transfers"],
                ["snapshots", "Snapshots"],
                ["return", "Return"],
                ["tags", "Tags"],
                ["summary", "Summary"],
              ] as [TabName, string][]
            ).map(([key, label]) => (
              <TabsTrigger key={key} value={key}>
                {label}
              </TabsTrigger>
            ))}
          </TabsList>

          {tab === "holdings" && (
            <HoldingsTab
              id={id!}
              onSelectSymbol={(s) => {
                setSymbolFilter(s);
                setTab("transactions");
              }}
            />
          )}
          {tab === "transactions" && (
            <TransactionsTab
              id={id!}
              symbolFilter={symbolFilter}
              onSymbolFilterChange={setSymbolFilter}
            />
          )}
          {tab === "transfers" && <TransfersTab id={id!} />}
          {tab === "snapshots" && <SnapshotsTab id={id!} />}
          {tab === "return" && <ReturnCurveTab id={id!} />}
          {tab === "summary" && <SummaryTab id={id!} />}
          {tab === "tags" && <TagsTab id={id!} />}
        </Tabs>
      </div>
    </div>
  );
}

function SummaryCard({ id }: { id: string }) {
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
        <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
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

type SortField =
  | "symbol"
  | "quantity"
  | "cost"
  | "marketValue"
  | "unrealizedPnl"
  | "unrealizedPnlRate";
type SortDirection = "asc" | "desc";
interface SortState {
  field: SortField;
  direction: SortDirection;
}

function HoldingsTab({
  id,
  onSelectSymbol,
}: {
  id: string;
  onSelectSymbol: (symbol: string) => void;
}) {
  const [sort, setSort] = useState<SortState>({ field: "unrealizedPnlRate", direction: "desc" });
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
          aVal = a.cost;
          bVal = b.cost;
          break;
        case "marketValue":
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
              <Th label="Symbol" field="symbol" sort={sort} onSort={setSort} />
              <Th label="Qty" field="quantity" sort={sort} onSort={setSort} />
              <Th label="Avg Cost" field="cost" sort={sort} onSort={setSort} />
              <Th label="Price" field="marketValue" sort={sort} onSort={setSort} />
              <Th label="Mkt Value" field="marketValue" sort={sort} onSort={setSort} />
              <Th label="P&L" field="unrealizedPnl" sort={sort} onSort={setSort} />
              <Th label="P&L%" field="unrealizedPnlRate" sort={sort} onSort={setSort} />
              <Th label="Weight%" field="marketValue" sort={sort} onSort={setSort} />
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
                onSelectSymbol={onSelectSymbol}
                symbolTags={symbolTags}
                totalMarketValue={totalMarketValue}
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
            onSelectSymbol={onSelectSymbol}
            symbolTags={symbolTags}
            totalMarketValue={totalMarketValue}
          />
        ))}
      </div>

      {sortedHoldings.length === 0 && (
        <p className="py-4 text-center text-sm text-muted-foreground">No holdings</p>
      )}
    </div>
  );
}

function Th({
  label,
  field,
  sort,
  onSort,
}: {
  label: string;
  field: SortField;
  sort: SortState;
  onSort: (s: SortState) => void;
}) {
  const isActive = sort.field === field;
  const arrow = isActive ? (sort.direction === "asc" ? "↑" : "↓") : "";

  return (
    <TableHead
      className="cursor-pointer select-none"
      onClick={() =>
        onSort({
          field,
          direction: isActive && sort.direction === "asc" ? "desc" : "asc",
        })
      }
    >
      {label} {arrow}
    </TableHead>
  );
}

function LotDetailsRow({
  id,
  holding,
  isExpanded,
  onToggle,
  onSelectSymbol,
  symbolTags,
  totalMarketValue,
}: {
  id: string;
  holding: Holding;
  isExpanded: boolean;
  onToggle: () => void;
  onSelectSymbol: (symbol: string) => void;
  symbolTags: Map<string, Array<{ id: number; name: string }>>;
  totalMarketValue: number;
}) {
  const { data: lotsData } = useQuery({
    queryKey: ["holding-lots", id, holding.symbol],
    queryFn: () => get<{ data: HoldingLots }>(`/portfolios/${id}/holdings/${holding.symbol}/lots`),
    enabled: isExpanded,
  });
  return (
    <>
      <TableRow className="cursor-pointer" onClick={onToggle}>
        <TableCell>
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">{isExpanded ? "▼" : "▶"}</span>
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
        <TableCell>{holding.quantity}</TableCell>
        <TableCell>{(holding.cost / holding.quantity).toFixed(2)}</TableCell>
        <TableCell>{holding.price?.toLocaleString() ?? "-"}</TableCell>
        <TableCell>{holding.market_value?.toLocaleString() ?? "-"}</TableCell>
        <TableCell
          className={(holding.unrealized_pnl ?? 0) >= 0 ? "text-green-600" : "text-red-600"}
        >
          {holding.unrealized_pnl?.toLocaleString() ?? "-"}
        </TableCell>
        <TableCell
          className={(holding.unrealized_pnl_rate ?? 0) >= 0 ? "text-green-600" : "text-red-600"}
        >
          {holding.unrealized_pnl_rate != null ? `${holding.unrealized_pnl_rate}%` : "-"}
        </TableCell>
        <TableCell className="text-muted-foreground">
          {totalMarketValue > 0
            ? `${(((holding.market_value ?? 0) / totalMarketValue) * 100).toFixed(1)}%`
            : "-"}
        </TableCell>
      </TableRow>
      {isExpanded && lotsData?.data && (
        <TableRow>
          <TableCell colSpan={8} className="bg-muted/50 px-4 py-2">
            <Table className="text-xs">
              <TableHeader>
                <TableRow>
                  <TableHead className="h-8">Date</TableHead>
                  <TableHead className="h-8">Buy Price</TableHead>
                  <TableHead className="h-8">Qty</TableHead>
                  <TableHead className="h-8">Rem</TableHead>
                  <TableHead className="h-8">Cost</TableHead>
                  <TableHead className="h-8">Value</TableHead>
                  <TableHead className="h-8">P&L</TableHead>
                  <TableHead className="h-8">P&L%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lotsData.data.lots.map((lot) => (
                  <TableRow
                    key={lot.id}
                    className={lot.status === "closed" ? "text-muted-foreground" : ""}
                  >
                    <TableCell>{lot.date}</TableCell>
                    <TableCell>{lot.buy_price}</TableCell>
                    <TableCell>{lot.quantity}</TableCell>
                    <TableCell>{lot.remaining_quantity}</TableCell>
                    <TableCell>{lot.cost_basis.toLocaleString()}</TableCell>
                    <TableCell>{lot.current_value?.toLocaleString() ?? "-"}</TableCell>
                    <TableCell
                      className={(lot.unrealized_pnl ?? 0) >= 0 ? "text-green-600" : "text-red-600"}
                    >
                      {lot.unrealized_pnl != null
                        ? `${lot.unrealized_pnl >= 0 ? "+" : ""}${lot.unrealized_pnl.toLocaleString()}`
                        : "-"}
                    </TableCell>
                    <TableCell
                      className={
                        (lot.unrealized_pnl_rate ?? 0) >= 0 ? "text-green-600" : "text-red-600"
                      }
                    >
                      {lot.unrealized_pnl_rate != null
                        ? `${lot.unrealized_pnl_rate >= 0 ? "+" : ""}${lot.unrealized_pnl_rate}%`
                        : "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <PriceHistorySection id={id} symbol={holding.symbol} isVisible={isExpanded} />
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
  onSelectSymbol,
  symbolTags,
  totalMarketValue,
}: {
  id: string;
  holding: Holding;
  isExpanded: boolean;
  onToggle: () => void;
  onSelectSymbol: (symbol: string) => void;
  symbolTags: Map<string, Array<{ id: number; name: string }>>;
  totalMarketValue: number;
}) {
  const { data: lotsData } = useQuery({
    queryKey: ["holding-lots", id, holding.symbol],
    queryFn: () => get<{ data: HoldingLots }>(`/portfolios/${id}/holdings/${holding.symbol}/lots`),
    enabled: isExpanded,
  });
  return (
    <Card>
      <CardContent className="cursor-pointer p-3" onClick={onToggle}>
        <div className="mb-2 flex items-center justify-between">
          <div>
            <span className="mr-1 text-xs text-muted-foreground">{isExpanded ? "▼" : "▶"}</span>
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
            Avg Cost: {(holding.cost / holding.quantity).toFixed(2)}
          </span>
          <span className="text-muted-foreground">
            {totalMarketValue > 0
              ? `${(((holding.market_value ?? 0) / totalMarketValue) * 100).toFixed(1)}%`
              : "-"}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">
            Mkt Value: {holding.market_value?.toLocaleString() ?? "-"}
          </span>
          <span
            className={
              holding.unrealized_pnl != null && holding.unrealized_pnl >= 0
                ? "text-green-600"
                : "text-red-600"
            }
          >
            P&L: {holding.unrealized_pnl?.toLocaleString() ?? "-"} (
            {holding.unrealized_pnl_rate != null ? `${holding.unrealized_pnl_rate}%` : "-"})
          </span>
        </div>
      </CardContent>
      {isExpanded && lotsData?.data && (
        <div className="space-y-1 border-t bg-muted/50 px-3 py-2">
          {lotsData.data.lots.map((lot) => (
            <div
              key={lot.id}
              className={`text-xs ${lot.status === "closed" ? "text-muted-foreground" : ""}`}
            >
              <div className="flex justify-between">
                <span>
                  {lot.date} | {lot.buy_price} × {lot.quantity} (rem {lot.remaining_quantity})
                </span>
                <span>{lot.status === "open" ? "Open" : "Closed"}</span>
              </div>
              <div className="flex justify-between">
                <span>Cost: {lot.cost_basis.toLocaleString()}</span>
                <span
                  className={
                    lot.unrealized_pnl != null && lot.unrealized_pnl >= 0
                      ? "text-green-600"
                      : "text-red-600"
                  }
                >
                  {lot.unrealized_pnl != null
                    ? `${lot.unrealized_pnl >= 0 ? "+" : ""}${lot.unrealized_pnl.toLocaleString()} (${lot.unrealized_pnl_rate ?? "-"}%)`
                    : "-"}
                </span>
              </div>
            </div>
          ))}
          <PriceHistorySection id={id} symbol={holding.symbol} isVisible={isExpanded} />
        </div>
      )}
    </Card>
  );
}

function PriceHistorySection({
  id,
  symbol,
  isVisible,
}: {
  id: string;
  symbol: string;
  isVisible: boolean;
}) {
  const [range, setRange] = useState<"1M" | "3M" | "1Y" | "3Y" | "YTD" | "ALL">("1Y");
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
      case "1Y":
        start = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
        break;
      case "3Y":
        start = new Date(today.getFullYear() - 3, today.getMonth(), today.getDate());
        break;
      case "YTD":
        start = new Date(today.getFullYear(), 0, 1);
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
    queryKey: ["transactions", id, symbol],
    queryFn: () => get<{ data: Transaction[] }>(`/portfolios/${id}/transactions?symbol=${symbol}`),
    enabled: isVisible,
  });

  const markers = useMemo(() => {
    const txs = txData?.data ?? [];
    const result: Array<{ index: number; label: string; color: string }> = [];
    for (const tx of txs) {
      if (tx.type !== "buy" && tx.type !== "sell" && tx.type !== "initial") continue;
      if (!tx.date) continue;
      // Find closest price date
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
  }, [txData, prices]);

  if (!isVisible) return null;

  return (
    <div className="mt-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1">
          {(["1M", "3M", "1Y", "3Y", "YTD", "ALL"] as const).map((r) => (
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
        <div>
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

function TransactionsTab({
  id,
  symbolFilter,
  onSymbolFilterChange,
}: {
  id: string;
  symbolFilter: string;
  onSymbolFilterChange: (filter: string) => void;
}) {
  const queryClient = useQueryClient();
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [datePreset, setDatePreset] = useState("ALL");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const presets: Record<string, string> = {
    "1M": "Past Month",
    "3M": "Past 3M",
    "1Y": "Past Year",
    YTD: "This Year",
    ALL: "All Time",
  };

  const today = new Date().toISOString().split("T")[0]!;
  let startDate: string | undefined;
  let endDate: string | undefined;

  if (datePreset === "1M") {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    startDate = d.toISOString().split("T")[0]!;
    endDate = today;
  } else if (datePreset === "3M") {
    const d = new Date();
    d.setMonth(d.getMonth() - 3);
    startDate = d.toISOString().split("T")[0]!;
    endDate = today;
  } else if (datePreset === "1Y") {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    startDate = d.toISOString().split("T")[0]!;
    endDate = today;
  } else if (datePreset === "YTD") {
    startDate = `${today.slice(0, 4)}-01-01`;
    endDate = today;
  } else if (datePreset === "CUSTOM") {
    startDate = customStart || undefined;
    endDate = customEnd || undefined;
  }

  const params = new URLSearchParams();
  if (symbolFilter) params.set("symbol", symbolFilter);
  if (startDate) params.set("startDate", startDate);
  if (endDate) params.set("endDate", endDate);
  const queryString = params.toString() ? `?${params.toString()}` : "";

  const { data, isLoading } = useQuery({
    queryKey: ["transactions", id, symbolFilter, startDate, endDate],
    queryFn: () => get<{ data: Transaction[] }>(`/portfolios/${id}/transactions${queryString}`),
  });

  const deleteMutation = useMutation({
    mutationFn: (txId: number) => del<{ data: null }>(`/portfolios/${id}/transactions/${txId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions", id] });
      setDeleteId(null);
    },
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading...</p>;

  return (
    <div>
      <div className="mb-4 flex justify-between">
        <h3 className="font-semibold">Transactions</h3>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          Add Transaction
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          type="text"
          value={symbolFilter}
          onChange={(e) => onSymbolFilterChange(e.target.value.toUpperCase())}
          placeholder="Filter by symbol"
          className="w-full max-w-xs"
        />
        <div className="flex flex-wrap gap-1">
          {Object.entries(presets).map(([key, label]) => (
            <Button
              key={key}
              size="sm"
              variant={datePreset === key ? "default" : "secondary"}
              onClick={() => setDatePreset(key)}
            >
              {label}
            </Button>
          ))}
          <Button
            size="sm"
            variant={datePreset === "CUSTOM" ? "default" : "secondary"}
            onClick={() => setDatePreset("CUSTOM")}
          >
            Custom
          </Button>
        </div>
        {datePreset === "CUSTOM" && (
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="h-8 w-auto text-xs"
            />
            <span className="text-xs text-muted-foreground">to</span>
            <Input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="h-8 w-auto text-xs"
            />
          </div>
        )}
      </div>

      <div className="space-y-1">
        {data?.data.map((tx) => (
          <div key={tx.id} className="flex items-center justify-between border-b py-2 text-sm">
            <div>
              <span className="font-medium">{tx.symbol}</span>
              <span className="ml-2 text-xs text-muted-foreground">{tx.name}</span>
              <TransactionTypeBadge type={tx.type} />
              <span className="ml-2 text-muted-foreground">{tx.date}</span>
            </div>
            <div className="flex items-center gap-3">
              <span>
                {tx.quantity} × {tx.price}
              </span>
              {tx.fee > 0 && <span className="text-muted-foreground">fee {tx.fee}</span>}
              <Button
                variant="link"
                className="h-auto p-0 text-xs text-destructive"
                onClick={() => setDeleteId(tx.id)}
              >
                Delete
              </Button>
            </div>
          </div>
        ))}
        {data?.data.length === 0 && (
          <p className="text-sm text-muted-foreground">No transactions yet.</p>
        )}
      </div>

      {showAdd && (
        <AddTransactionModal
          portfolioId={id}
          onClose={() => setShowAdd(false)}
          onCreated={() => {
            queryClient.invalidateQueries({ queryKey: ["transactions", id] });
            setShowAdd(false);
          }}
        />
      )}
      {deleteId !== null && (
        <ConfirmModal
          message="Delete this transaction? Lot effects will be rolled back."
          onConfirm={() => deleteMutation.mutate(deleteId)}
          onCancel={() => setDeleteId(null)}
        />
      )}
    </div>
  );
}

function TransactionTypeBadge({ type }: { type: string }) {
  const className =
    type === "buy"
      ? "bg-green-100 text-green-700"
      : type === "sell"
        ? "bg-red-100 text-red-700"
        : type === "initial"
          ? "bg-amber-100 text-amber-700"
          : "bg-blue-100 text-blue-700";

  return (
    <Badge variant="secondary" className={`ml-2 border-transparent ${className}`}>
      {type}
    </Badge>
  );
}

function AddTransactionModal({
  portfolioId,
  onClose,
  onCreated,
}: {
  portfolioId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [symbol, setSymbol] = useState("");
  const [type, setType] = useState<"buy" | "sell" | "dividend" | "initial">("buy");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [fee, setFee] = useState("0");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0] ?? "");

  const mutation = useMutation({
    mutationFn: (body: unknown) => post(`/portfolios/${portfolioId}/transactions`, body),
    onSuccess: onCreated,
  });

  const handleSubmit = () => {
    mutation.mutate({
      symbol: symbol.trim().toUpperCase(),
      type,
      quantity: type === "dividend" ? 0 : parseFloat(quantity),
      price: parseFloat(price),
      fee: parseFloat(fee) || 0,
      date,
    });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Transaction</DialogTitle>
        </DialogHeader>
        {mutation.error && <p className="text-sm text-destructive">{mutation.error.message}</p>}
        <div className="space-y-3">
          <div>
            <Label htmlFor="transaction-symbol">Symbol</Label>
            <Input
              id="transaction-symbol"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              placeholder="AAPL"
            />
          </div>
          <div>
            <Label htmlFor="transaction-type">Type</Label>
            <Select
              id="transaction-type"
              value={type}
              onChange={(e) => setType(e.target.value as "buy" | "sell" | "dividend" | "initial")}
            >
              <option value="buy">Buy</option>
              <option value="sell">Sell</option>
              <option value="dividend">Dividend</option>
              <option value="initial">Initial</option>
            </Select>
          </div>
          {type !== "dividend" && (
            <div>
              <Label htmlFor="transaction-quantity">Quantity</Label>
              <Input
                id="transaction-quantity"
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
          )}
          <div>
            <Label htmlFor="transaction-price">{type === "dividend" ? "Amount" : "Price"}</Label>
            <Input
              id="transaction-price"
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="transaction-fee">
              {type === "dividend" ? "Withholding Tax" : "Fee"}
            </Label>
            <Input
              id="transaction-fee"
              type="number"
              value={fee}
              onChange={(e) => setFee(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="transaction-date">Date</Label>
            <Input
              id="transaction-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!symbol.trim() || mutation.isPending} onClick={handleSubmit}>
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TransfersTab({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["transfers", id],
    queryFn: () => get<{ data: Transfer[] }>(`/portfolios/${id}/transfers`),
  });

  const deleteMutation = useMutation({
    mutationFn: (transferId: number) =>
      del<{ data: null }>(`/portfolios/${id}/transfers/${transferId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transfers", id] });
      queryClient.invalidateQueries({ queryKey: ["summary", id] });
      setDeleteId(null);
    },
  });

  if (isLoading) return <p className="text-sm text-gray-500">Loading...</p>;

  return (
    <div>
      <div className="flex justify-between mb-4">
        <h3 className="font-semibold">Transfers</h3>
        <button
          className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 cursor-pointer"
          onClick={() => setShowAdd(true)}
        >
          Add Transfer
        </button>
      </div>

      {data?.data.length === 0 && <p className="text-sm text-gray-500">No transfers yet.</p>}

      <div className="space-y-1">
        {data?.data.map((t) => {
          const netEffect = t.type === "deposit" ? t.amount - t.fee : -(t.amount + t.fee);
          return (
            <div key={t.id} className="flex items-center justify-between py-2 border-b text-sm">
              <div>
                <span className="font-medium">{t.date}</span>
                <span
                  className={`ml-2 px-1.5 py-0.5 rounded text-xs ${
                    t.type === "deposit" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                  }`}
                >
                  {t.type}
                </span>
                {t.note && <span className="ml-2 text-gray-400">{t.note}</span>}
              </div>
              <div className="flex items-center gap-3">
                <span>{t.amount.toLocaleString()}</span>
                {t.fee > 0 && <span className="text-gray-400">fee {t.fee}</span>}
                <span className={netEffect >= 0 ? "text-green-600" : "text-red-600"}>
                  {netEffect >= 0 ? "+" : ""}
                  {netEffect.toLocaleString()}
                </span>
                <button
                  className="text-red-500 text-xs hover:underline cursor-pointer"
                  onClick={() => setDeleteId(t.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {showAdd && (
        <AddTransferModal
          portfolioId={id}
          onClose={() => setShowAdd(false)}
          onCreated={() => {
            queryClient.invalidateQueries({ queryKey: ["transfers", id] });
            queryClient.invalidateQueries({ queryKey: ["summary", id] });
            setShowAdd(false);
          }}
        />
      )}
      {deleteId !== null && (
        <ConfirmModal
          message="Delete this transfer? Cash balance will be adjusted."
          onConfirm={() => deleteMutation.mutate(deleteId)}
          onCancel={() => setDeleteId(null)}
        />
      )}
    </div>
  );
}

function AddTransferModal({
  portfolioId,
  onClose,
  onCreated,
}: {
  portfolioId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [type, setType] = useState<"deposit" | "withdrawal">("deposit");
  const [amount, setAmount] = useState("");
  const [fee, setFee] = useState("0");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0] ?? "");
  const [note, setNote] = useState("");

  const mutation = useMutation({
    mutationFn: (body: unknown) => post(`/portfolios/${portfolioId}/transfers`, body),
    onSuccess: onCreated,
  });

  const handleSubmit = () => {
    mutation.mutate({
      type,
      amount: parseFloat(amount),
      fee: parseFloat(fee) || 0,
      date,
      note: note || undefined,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-xl">
        <h3 className="text-lg font-semibold mb-4">Add Transfer</h3>
        {mutation.error && <p className="mb-3 text-red-500 text-sm">{mutation.error.message}</p>}
        <div className="space-y-3">
          <div>
            <label className="block text-sm mb-1">Type</label>
            <select
              className="w-full border rounded px-3 py-2"
              value={type}
              onChange={(e) => setType(e.target.value as "deposit" | "withdrawal")}
            >
              <option value="deposit">Deposit</option>
              <option value="withdrawal">Withdrawal</option>
            </select>
          </div>
          <div>
            <label className="block text-sm mb-1">Amount</label>
            <input
              className="w-full border rounded px-3 py-2"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="10000"
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Fee</label>
            <input
              className="w-full border rounded px-3 py-2"
              type="number"
              value={fee}
              onChange={(e) => setFee(e.target.value)}
              placeholder="0"
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Date</label>
            <input
              className="w-full border rounded px-3 py-2"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Note (optional)</label>
            <input
              className="w-full border rounded px-3 py-2"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Initial funding"
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-4">
          <button
            className="px-4 py-2 text-gray-600 rounded hover:bg-gray-100 cursor-pointer"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 cursor-pointer"
            disabled={!amount || parseFloat(amount) <= 0 || mutation.isPending}
            onClick={handleSubmit}
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}

function SnapshotsTab({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["snapshots", id],
    queryFn: () => get<{ data: Snapshot[] }>(`/portfolios/${id}/snapshots`),
  });

  const deleteMutation = useMutation({
    mutationFn: (snapshotId: number) =>
      del<{ data: null }>(`/portfolios/${id}/snapshots/${snapshotId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["snapshots", id] }),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading...</p>;

  return (
    <div>
      <div className="mb-4 flex justify-between">
        <h3 className="font-semibold">Snapshots</h3>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          Add Snapshot
        </Button>
      </div>

      {data?.data.length === 0 && (
        <p className="text-sm text-muted-foreground">No snapshots yet.</p>
      )}

      <div className="space-y-1">
        {data?.data.map((s) => {
          const pnl = s.market_value - s.total_investment;
          const rate = s.total_investment > 0 ? (pnl / s.total_investment) * 100 : 0;
          return (
            <div key={s.id} className="flex items-center justify-between border-b py-2 text-sm">
              <div>
                <span className="font-medium">{s.date}</span>
                {s.note && <span className="ml-2 text-muted-foreground">{s.note}</span>}
              </div>
              <div className="flex items-center gap-3">
                <span>Inv: {s.total_investment.toLocaleString()}</span>
                <span>Mkt: {s.market_value.toLocaleString()}</span>
                <span className={pnl >= 0 ? "text-green-600" : "text-red-600"}>
                  P&L: {pnl.toLocaleString()} ({rate >= 0 ? "+" : ""}
                  {rate.toFixed(1)}%)
                </span>
                <Button
                  variant="link"
                  className="h-auto p-0 text-xs text-destructive"
                  onClick={() => deleteMutation.mutate(s.id)}
                >
                  Delete
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {showAdd && (
        <AddSnapshotModal
          portfolioId={id}
          onClose={() => setShowAdd(false)}
          onCreated={() => {
            queryClient.invalidateQueries({ queryKey: ["snapshots", id] });
            setShowAdd(false);
          }}
        />
      )}
    </div>
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

function ReturnCurveTab({ id }: { id: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["snapshots", id],
    queryFn: () => get<{ data: Snapshot[] }>(`/portfolios/${id}/snapshots`),
  });

  const summary = useQuery({
    queryKey: ["summary", id],
    queryFn: () => get<{ data: Summary }>(`/portfolios/${id}/summary`),
  });

  if (isLoading || summary.isLoading)
    return <p className="text-sm text-muted-foreground">Loading...</p>;

  const snapshots = data?.data ?? [];
  const currentSummary = summary.data?.data;

  interface ChartPoint {
    date: string;
    marketValue: number;
    investment: number;
    returnRate: number;
  }

  const points: ChartPoint[] = snapshots
    .map((s) => ({
      date: s.date,
      marketValue: s.market_value,
      investment: s.total_investment,
      returnRate:
        s.total_investment > 0
          ? ((s.market_value - s.total_investment) / s.total_investment) * 100
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

  if (points.length === 0)
    return (
      <p className="text-sm text-gray-500">
        No data for return curve. Add snapshots to see the chart.
      </p>
    );

  return (
    <div>
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
            formatValue={(v) => v.toLocaleString()}
          />
          <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="inline-block h-0.5 w-3 bg-blue-600" /> Market Value
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-0.5 w-3 bg-gray-400" /> Investment
            </span>
          </div>
        </CardContent>
      </Card>

      <h3 className="mb-4 font-semibold">Return Rate Over Time</h3>
      <Card>
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
    </div>
  );
}

function SummaryTab({ id }: { id: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["summary", id],
    queryFn: () => get<{ data: Summary }>(`/portfolios/${id}/summary`),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading...</p>;

  const s = data?.data;
  if (!s) return null;

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
    </div>
  );
}

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
    <Card>
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

function TagsTab({ id }: { id: string }) {
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

      {tags.length === 0 && !tagAggregates.length && (
        <p className="text-sm text-muted-foreground">No tags yet.</p>
      )}

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

function ConfirmModal({
  message,
  onConfirm,
  onCancel,
}: {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Confirm Action</DialogTitle>
          <DialogDescription>{message}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
