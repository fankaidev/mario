import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "react-router-dom";
import { LineChart } from "../components/LineChart";
import { get, post, del } from "../lib/api";
import type { HoldingLots } from "../../../shared/types/api";

import type { HoldingLots } from "../../../shared/types/api";

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

interface Transaction {
  id: number;
  symbol: string;
  name: string;
  type: string;
  quantity: number;
  price: number;
  fee: number;
  date: string;
}

interface Summary {
  total_investment: number;
  total_market_value: number;
  unrealized_pnl: number;
  realized_pnl: number;
  dividend_income: number;
  total_pnl: number;
  return_rate: number;
  cumulative_buy_fees: number;
  cumulative_sell_fees: number;
  cumulative_withholding_tax: number;
  cumulative_total_fees: number;
}

interface Snapshot {
  id: number;
  date: string;
  total_investment: number;
  market_value: number;
  note: string | null;
}

interface Portfolio {
  id: number;
  name: string;
  currency: string;
}

type TabName = "holdings" | "transactions" | "snapshots" | "return" | "summary" | "tags";

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
    <div className="min-h-screen bg-gray-50">
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <Link to="/" className="text-blue-600 hover:underline text-sm">
          ← Back to Portfolios
        </Link>
        <h1 className="text-xl md:text-2xl font-bold mt-2 mb-4">
          {portfolio ? `${portfolio.name} (${portfolio.currency})` : "Loading..."}
        </h1>

        <SummaryCard id={id!} />

        <div className="mt-6">
          <div className="flex gap-1 border-b mb-4 overflow-x-auto">
            {(
              [
                ["holdings", "Holdings"],
                ["transactions", "Trans."],
                ["snapshots", "Snapshots"],
                ["return", "Return"],
                ["summary", "Summary"],
                ["tags", "Tags"],
              ] as [TabName, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                className={`px-3 md:px-4 py-2 text-sm whitespace-nowrap cursor-pointer ${tab === key ? "border-b-2 border-blue-600 text-blue-600" : "text-gray-500"}`}
                onClick={() => setTab(key)}
              >
                {label}
              </button>
            ))}
          </div>

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
          {tab === "snapshots" && <SnapshotsTab id={id!} />}
          {tab === "return" && <ReturnCurveTab id={id!} />}
          {tab === "summary" && <SummaryTab id={id!} />}
          {tab === "tags" && <TagsTab id={id!} />}
        </div>
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
    <div className="bg-white rounded-lg border p-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricBox label="Total Investment" value={s.total_investment} />
        <MetricBox label="Market Value" value={s.total_market_value} />
        <MetricBox label="Total P&L" value={s.total_pnl} highlight />
        <MetricBox label="Return Rate" value={`${s.return_rate}%`} />
      </div>
    </div>
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
      <p className="text-xs text-gray-500">{label}</p>
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
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["holdings", id],
    queryFn: () => get<{ data: Holding[] }>(`/portfolios/${id}/holdings`),
  });

  const { data: lotsData } = useQuery({
    queryKey: ["holding-lots", id, expandedSymbol],
    queryFn: () => get<{ data: HoldingLots }>(`/portfolios/${id}/holdings/${expandedSymbol}/lots`),
    enabled: expandedSymbol !== null,
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

  if (isLoading) return <p className="text-sm text-gray-500">Loading...</p>;

  const totalMarketValue = sortedHoldings.reduce((sum, h) => sum + (h.market_value ?? 0), 0);

  return (
    <div>
      {tags.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1">
          <button
            className={`px-2 py-1 text-xs rounded cursor-pointer ${tagFilter === null ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
            onClick={() => setTagFilter(null)}
          >
            All
          </button>
          {tags.map((tag) => (
            <button
              key={tag.id}
              className={`px-2 py-1 text-xs rounded cursor-pointer ${tagFilter === tag.id ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
              onClick={() => setTagFilter(tag.id === tagFilter ? null : tag.id)}
            >
              {tag.name}
            </button>
          ))}
        </div>
      )}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <Th label="Symbol" field="symbol" sort={sort} onSort={setSort} />
              <Th label="Qty" field="quantity" sort={sort} onSort={setSort} />
              <Th label="Avg Cost" field="cost" sort={sort} onSort={setSort} />
              <Th label="Price" field="marketValue" sort={sort} onSort={setSort} />
              <Th label="Mkt Value" field="marketValue" sort={sort} onSort={setSort} />
              <Th label="P&L" field="unrealizedPnl" sort={sort} onSort={setSort} />
              <Th label="P&L%" field="unrealizedPnlRate" sort={sort} onSort={setSort} />
              <Th label="Weight%" field="marketValue" sort={sort} onSort={setSort} />
            </tr>
          </thead>
          <tbody>
            {sortedHoldings.map((h) => (
              <LotDetailsRow
                key={h.symbol}
                holding={h}
                isExpanded={expandedSymbol === h.symbol}
                onToggle={() => setExpandedSymbol(expandedSymbol === h.symbol ? null : h.symbol)}
                lotsData={expandedSymbol === h.symbol ? lotsData?.data : undefined}
                onSelectSymbol={onSelectSymbol}
                symbolTags={symbolTags}
                totalMarketValue={totalMarketValue}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="md:hidden space-y-2">
        {sortedHoldings.map((h) => (
          <MobileLotDetailsCard
            key={h.symbol}
            holding={h}
            isExpanded={expandedSymbol === h.symbol}
            onToggle={() => setExpandedSymbol(expandedSymbol === h.symbol ? null : h.symbol)}
            lotsData={expandedSymbol === h.symbol ? lotsData?.data : undefined}
            onSelectSymbol={onSelectSymbol}
            symbolTags={symbolTags}
            totalMarketValue={totalMarketValue}
          />
        ))}
      </div>

      {sortedHoldings.length === 0 && (
        <p className="text-sm text-gray-500 text-center py-4">No holdings</p>
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
    <th
      className="py-2 pr-4 cursor-pointer select-none"
      onClick={() =>
        onSort({
          field,
          direction: isActive && sort.direction === "asc" ? "desc" : "asc",
        })
      }
    >
      {label} {arrow}
    </th>
  );
}

function LotDetailsRow({
  holding,
  isExpanded,
  onToggle,
  lotsData,
  onSelectSymbol,
  symbolTags,
  totalMarketValue,
}: {
  holding: Holding;
  isExpanded: boolean;
  onToggle: () => void;
  lotsData: HoldingLots | undefined;
  onSelectSymbol: (symbol: string) => void;
  symbolTags: Map<string, Array<{ id: number; name: string }>>;
  totalMarketValue: number;
}) {
  return (
    <>
      <tr className="border-b cursor-pointer hover:bg-gray-50" onClick={onToggle}>
        <td className="py-2">
          <div className="flex items-center gap-1">
            <span className="text-gray-400 text-xs">{isExpanded ? "▼" : "▶"}</span>
            <button
              className="font-medium text-blue-600 hover:underline cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                onSelectSymbol(holding.symbol);
              }}
            >
              {holding.symbol}
            </button>
          </div>
          <div className="text-xs text-gray-500">{holding.name}</div>
          {symbolTags.has(holding.symbol) && (
            <div className="flex flex-wrap gap-0.5 mt-0.5">
              {symbolTags.get(holding.symbol)!.map((tag) => (
                <span key={tag.id} className="px-1 py-0.5 bg-blue-50 text-blue-600 rounded text-xs">
                  {tag.name}
                </span>
              ))}
            </div>
          )}
        </td>
        <td className="py-2">{holding.quantity}</td>
        <td className="py-2">{(holding.cost / holding.quantity).toFixed(2)}</td>
        <td className="py-2">{holding.price?.toLocaleString() ?? "-"}</td>
        <td className="py-2">{holding.market_value?.toLocaleString() ?? "-"}</td>
        <td
          className={`py-2 ${(holding.unrealized_pnl ?? 0) >= 0 ? "text-green-600" : "text-red-600"}`}
        >
          {holding.unrealized_pnl?.toLocaleString() ?? "-"}
        </td>
        <td
          className={`py-2 ${(holding.unrealized_pnl_rate ?? 0) >= 0 ? "text-green-600" : "text-red-600"}`}
        >
          {holding.unrealized_pnl_rate != null ? `${holding.unrealized_pnl_rate}%` : "-"}
        </td>
        <td className="py-2 text-gray-500">
          {totalMarketValue > 0
            ? `${(((holding.market_value ?? 0) / totalMarketValue) * 100).toFixed(1)}%`
            : "-"}
        </td>
      </tr>
      {isExpanded && lotsData && (
        <tr>
          <td colSpan={8} className="bg-gray-50 px-4 py-2">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="py-1 pr-2 font-normal">Date</th>
                  <th className="py-1 pr-2 font-normal">Buy Price</th>
                  <th className="py-1 pr-2 font-normal">Qty</th>
                  <th className="py-1 pr-2 font-normal">Rem</th>
                  <th className="py-1 pr-2 font-normal">Cost</th>
                  <th className="py-1 pr-2 font-normal">Value</th>
                  <th className="py-1 pr-2 font-normal">P&L</th>
                  <th className="py-1 font-normal">P&L%</th>
                </tr>
              </thead>
              <tbody>
                {lotsData.lots.map((lot) => (
                  <tr key={lot.id} className={`${lot.status === "closed" ? "text-gray-400" : ""}`}>
                    <td className="py-1 pr-2">{lot.date}</td>
                    <td className="py-1 pr-2">{lot.buy_price}</td>
                    <td className="py-1 pr-2">{lot.quantity}</td>
                    <td className="py-1 pr-2">{lot.remaining_quantity}</td>
                    <td className="py-1 pr-2">{lot.cost_basis.toLocaleString()}</td>
                    <td className="py-1 pr-2">{lot.current_value?.toLocaleString() ?? "-"}</td>
                    <td
                      className={`py-1 pr-2 ${(lot.unrealized_pnl ?? 0) >= 0 ? "text-green-600" : "text-red-600"}`}
                    >
                      {lot.unrealized_pnl != null
                        ? `${lot.unrealized_pnl >= 0 ? "+" : ""}${lot.unrealized_pnl.toLocaleString()}`
                        : "-"}
                    </td>
                    <td
                      className={`py-1 ${(lot.unrealized_pnl_rate ?? 0) >= 0 ? "text-green-600" : "text-red-600"}`}
                    >
                      {lot.unrealized_pnl_rate != null
                        ? `${lot.unrealized_pnl_rate >= 0 ? "+" : ""}${lot.unrealized_pnl_rate}%`
                        : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  );
}

function MobileLotDetailsCard({
  holding,
  isExpanded,
  onToggle,
  lotsData,
  onSelectSymbol,
  symbolTags,
  totalMarketValue,
}: {
  holding: Holding;
  isExpanded: boolean;
  onToggle: () => void;
  lotsData: HoldingLots | undefined;
  onSelectSymbol: (symbol: string) => void;
  symbolTags: Map<string, Array<{ id: number; name: string }>>;
  totalMarketValue: number;
}) {
  return (
    <div className="bg-white rounded-lg border">
      <div className="p-3 cursor-pointer" onClick={onToggle}>
        <div className="flex justify-between items-center mb-2">
          <div>
            <span className="text-gray-400 text-xs mr-1">{isExpanded ? "▼" : "▶"}</span>
            <button
              className="font-semibold text-blue-600 cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                onSelectSymbol(holding.symbol);
              }}
            >
              {holding.symbol}
            </button>
            <div className="text-xs text-gray-500">{holding.name}</div>
            {symbolTags.has(holding.symbol) && (
              <div className="flex flex-wrap gap-0.5 mt-0.5">
                {symbolTags.get(holding.symbol)!.map((tag) => (
                  <span
                    key={tag.id}
                    className="px-1 py-0.5 bg-blue-50 text-blue-600 rounded text-xs"
                  >
                    {tag.name}
                  </span>
                ))}
              </div>
            )}
          </div>
          <span className="text-sm text-gray-500">{holding.quantity} shares</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">
            Avg Cost: {(holding.cost / holding.quantity).toFixed(2)}
          </span>
          <span className="text-gray-500">
            {totalMarketValue > 0
              ? `${(((holding.market_value ?? 0) / totalMarketValue) * 100).toFixed(1)}%`
              : "-"}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">
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
      </div>
      {isExpanded && lotsData && (
        <div className="border-t px-3 py-2 bg-gray-50 space-y-1">
          {lotsData.lots.map((lot) => (
            <div
              key={lot.id}
              className={`text-xs ${lot.status === "closed" ? "text-gray-400" : ""}`}
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

  if (isLoading) return <p className="text-sm text-gray-500">Loading...</p>;

  return (
    <div>
      <div className="flex justify-between mb-4">
        <h3 className="font-semibold">Transactions</h3>
        <button
          className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 cursor-pointer"
          onClick={() => setShowAdd(true)}
        >
          Add Transaction
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2 items-center">
        <input
          type="text"
          value={symbolFilter}
          onChange={(e) => onSymbolFilterChange(e.target.value.toUpperCase())}
          placeholder="Filter by symbol"
          className="w-full max-w-xs border rounded px-3 py-2 text-sm"
        />
        <div className="flex gap-1 flex-wrap">
          {Object.entries(presets).map(([key, label]) => (
            <button
              key={key}
              className={`px-2 py-1 text-xs rounded cursor-pointer ${datePreset === key ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
              onClick={() => setDatePreset(key)}
            >
              {label}
            </button>
          ))}
          <button
            className={`px-2 py-1 text-xs rounded cursor-pointer ${datePreset === "CUSTOM" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
            onClick={() => setDatePreset("CUSTOM")}
          >
            Custom
          </button>
        </div>
        {datePreset === "CUSTOM" && (
          <div className="flex gap-2 items-center">
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="border rounded px-2 py-1 text-xs"
            />
            <span className="text-xs text-gray-500">to</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="border rounded px-2 py-1 text-xs"
            />
          </div>
        )}
      </div>

      <div className="space-y-1">
        {data?.data.map((tx) => (
          <div key={tx.id} className="flex items-center justify-between py-2 border-b text-sm">
            <div>
              <span className="font-medium">{tx.symbol}</span>
              <span className="ml-2 text-xs text-gray-500">{tx.name}</span>
              <span
                className={`ml-2 px-1.5 py-0.5 rounded text-xs ${
                  tx.type === "buy"
                    ? "bg-green-100 text-green-700"
                    : tx.type === "sell"
                      ? "bg-red-100 text-red-700"
                      : tx.type === "initial"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-blue-100 text-blue-700"
                }`}
              >
                {tx.type}
              </span>
              <span className="ml-2 text-gray-500">{tx.date}</span>
            </div>
            <div className="flex items-center gap-3">
              <span>
                {tx.quantity} × {tx.price}
              </span>
              {tx.fee > 0 && <span className="text-gray-400">fee {tx.fee}</span>}
              <button
                className="text-red-500 text-xs hover:underline cursor-pointer"
                onClick={() => setDeleteId(tx.id)}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
        {data?.data.length === 0 && <p className="text-sm text-gray-500">No transactions yet.</p>}
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
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-xl">
        <h3 className="text-lg font-semibold mb-4">Add Transaction</h3>
        {mutation.error && <p className="mb-3 text-red-500 text-sm">{mutation.error.message}</p>}
        <div className="space-y-3">
          <div>
            <label className="block text-sm mb-1">Symbol</label>
            <input
              className="w-full border rounded px-3 py-2"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              placeholder="AAPL"
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Type</label>
            <select
              className="w-full border rounded px-3 py-2"
              value={type}
              onChange={(e) => setType(e.target.value as "buy" | "sell" | "dividend" | "initial")}
            >
              <option value="buy">Buy</option>
              <option value="sell">Sell</option>
              <option value="dividend">Dividend</option>
              <option value="initial">Initial</option>
            </select>
          </div>
          {type !== "dividend" && (
            <div>
              <label className="block text-sm mb-1">Quantity</label>
              <input
                className="w-full border rounded px-3 py-2"
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
          )}
          <div>
            <label className="block text-sm mb-1">{type === "dividend" ? "Amount" : "Price"}</label>
            <input
              className="w-full border rounded px-3 py-2"
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm mb-1">
              {type === "dividend" ? "Withholding Tax" : "Fee"}
            </label>
            <input
              className="w-full border rounded px-3 py-2"
              type="number"
              value={fee}
              onChange={(e) => setFee(e.target.value)}
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
            disabled={!symbol.trim() || mutation.isPending}
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

  if (isLoading) return <p className="text-sm text-gray-500">Loading...</p>;

  return (
    <div>
      <div className="flex justify-between mb-4">
        <h3 className="font-semibold">Snapshots</h3>
        <button
          className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 cursor-pointer"
          onClick={() => setShowAdd(true)}
        >
          Add Snapshot
        </button>
      </div>

      {data?.data.length === 0 && <p className="text-sm text-gray-500">No snapshots yet.</p>}

      <div className="space-y-1">
        {data?.data.map((s) => {
          const pnl = s.market_value - s.total_investment;
          const rate = s.total_investment > 0 ? (pnl / s.total_investment) * 100 : 0;
          return (
            <div key={s.id} className="flex items-center justify-between py-2 border-b text-sm">
              <div>
                <span className="font-medium">{s.date}</span>
                {s.note && <span className="ml-2 text-gray-400">{s.note}</span>}
              </div>
              <div className="flex items-center gap-3">
                <span>Inv: {s.total_investment.toLocaleString()}</span>
                <span>Mkt: {s.market_value.toLocaleString()}</span>
                <span className={pnl >= 0 ? "text-green-600" : "text-red-600"}>
                  P&L: {pnl.toLocaleString()} ({rate >= 0 ? "+" : ""}
                  {rate.toFixed(1)}%)
                </span>
                <button
                  className="text-red-500 text-xs hover:underline cursor-pointer"
                  onClick={() => deleteMutation.mutate(s.id)}
                >
                  Delete
                </button>
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
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-xl">
        <h3 className="text-lg font-semibold mb-4">Add Snapshot</h3>
        {mutation.error && <p className="mb-3 text-red-500 text-sm">{mutation.error.message}</p>}
        <div className="space-y-3">
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
            <label className="block text-sm mb-1">Total Investment</label>
            <input
              className="w-full border rounded px-3 py-2"
              type="number"
              value={investment}
              onChange={(e) => setInvestment(e.target.value)}
              placeholder="100000"
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Market Value</label>
            <input
              className="w-full border rounded px-3 py-2"
              type="number"
              value={marketValue}
              onChange={(e) => setMarketValue(e.target.value)}
              placeholder="120000"
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Note (optional)</label>
            <input
              className="w-full border rounded px-3 py-2"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Year end snapshot"
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
            disabled={mutation.isPending}
            onClick={handleSubmit}
          >
            Add
          </button>
        </div>
      </div>
    </div>
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

  if (isLoading || summary.isLoading) return <p className="text-sm text-gray-500">Loading...</p>;

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
      marketValue: Math.round(currentSummary.total_market_value * 100) / 100,
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
      <h3 className="font-semibold mb-4">Market Value Over Time</h3>
      <div className="bg-white rounded-lg border p-4 mb-6">
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
        <div className="flex gap-4 mt-2 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 bg-blue-600 inline-block" /> Market Value
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 bg-gray-400 inline-block" /> Investment
          </span>
        </div>
      </div>

      <h3 className="font-semibold mb-4">Return Rate Over Time</h3>
      <div className="bg-white rounded-lg border p-4">
        <LineChart
          data={points.map((p) => ({
            label: p.date,
            values: [{ key: "rate", value: p.returnRate, color: "#059669" }],
          }))}
          height={250}
          formatValue={(v) => `${v.toFixed(1)}%`}
        />
      </div>
    </div>
  );
}

function SummaryTab({ id }: { id: string }) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["summary", id],
    queryFn: () => get<{ data: Summary }>(`/portfolios/${id}/summary`),
  });

  const priceMutation = useMutation({
    mutationFn: () => post("/prices/update", {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["summary", id] }),
  });

  if (isLoading) return <p className="text-sm text-gray-500">Loading...</p>;

  const s = data?.data;
  if (!s) return null;

  return (
    <div>
      <div className="flex justify-between mb-4">
        <h3 className="font-semibold">Summary</h3>
        <button
          className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 cursor-pointer"
          onClick={() => priceMutation.mutate()}
        >
          Update Prices
        </button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Metric label="Total Investment" value={s.total_investment} />
        <Metric label="Market Value" value={s.total_market_value} />
        <Metric label="Unrealized P&L" value={s.unrealized_pnl} />
        <Metric label="Realized P&L" value={s.realized_pnl} />
        <Metric label="Dividend Income" value={s.dividend_income} />
        <Metric label="Total P&L" value={s.total_pnl} highlight />
        <Metric label="Return Rate" value={`${s.return_rate}%`} />
      </div>
      <h4 className="font-semibold mt-6 mb-2">Fees</h4>
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div className="flex justify-between p-2 bg-gray-100 rounded">
          <span>Buy Fees</span>
          <span>{s.cumulative_buy_fees}</span>
        </div>
        <div className="flex justify-between p-2 bg-gray-100 rounded">
          <span>Sell Fees</span>
          <span>{s.cumulative_sell_fees}</span>
        </div>
        <div className="flex justify-between p-2 bg-gray-100 rounded">
          <span>Withholding Tax</span>
          <span>{s.cumulative_withholding_tax}</span>
        </div>
        <div className="flex justify-between p-2 bg-gray-100 rounded font-medium">
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
    <div className="p-3 border rounded">
      <p className="text-xs text-gray-500">{label}</p>
      <p
        className={`text-lg ${highlight ? "font-bold" : "font-medium"} ${typeof value === "number" && value >= 0 ? "text-green-700" : "text-red-700"}`}
      >
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
    </div>
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

  if (tagsLoading) return <p className="text-sm text-gray-500">Loading...</p>;

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
      <h3 className="font-semibold mb-4">Tags</h3>

      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={newTagName}
          onChange={(e) => setNewTagName(e.target.value)}
          placeholder="New tag name"
          className="border rounded px-3 py-2 text-sm flex-1"
          onKeyDown={(e) => {
            if (e.key === "Enter" && newTagName.trim()) {
              createMutation.mutate(newTagName.trim());
            }
          }}
        />
        <button
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 cursor-pointer disabled:opacity-50"
          disabled={!newTagName.trim() || createMutation.isPending}
          onClick={() => createMutation.mutate(newTagName.trim())}
        >
          Add
        </button>
      </div>

      {createMutation.error && (
        <p className="text-red-500 text-sm mb-3">{createMutation.error.message}</p>
      )}

      {tagAggregates.length > 0 && (
        <div className="mb-6">
          <h4 className="text-sm font-semibold mb-2">Aggregated P&L by Tag</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-1 pr-2">Tag</th>
                  <th className="py-1 pr-2">Cost</th>
                  <th className="py-1 pr-2">Mkt Value</th>
                  <th className="py-1 pr-2">P&L</th>
                  <th className="py-1">P&L%</th>
                </tr>
              </thead>
              <tbody>
                {tagAggregates.map((tag) => (
                  <tr key={tag.id} className="border-b">
                    <td className="py-1 pr-2">{tag.name}</td>
                    <td className="py-1 pr-2">{tag.cost.toLocaleString()}</td>
                    <td className="py-1 pr-2">{tag.marketValue.toLocaleString()}</td>
                    <td className={`py-1 pr-2 ${tag.pnl >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {tag.pnl.toLocaleString()}
                    </td>
                    <td className={`py-1 ${tag.pnlRate >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {tag.pnlRate >= 0 ? "+" : ""}
                      {tag.pnlRate.toFixed(1)}%
                    </td>
                  </tr>
                ))}
                {untaggedHoldings.length > 0 && (
                  <tr className="border-b">
                    <td className="py-1 pr-2 text-gray-400">Untagged</td>
                    <td className="py-1 pr-2 text-gray-400">{untaggedCost.toLocaleString()}</td>
                    <td className="py-1 pr-2 text-gray-400">{untaggedMV.toLocaleString()}</td>
                    <td
                      className={`py-1 pr-2 text-gray-400 ${untaggedMV - untaggedCost >= 0 ? "text-green-600" : "text-red-600"}`}
                    >
                      {(untaggedMV - untaggedCost).toLocaleString()}
                    </td>
                    <td
                      className={`py-1 text-gray-400 ${untaggedCost > 0 && untaggedMV - untaggedCost >= 0 ? "text-green-600" : "text-red-600"}`}
                    >
                      {untaggedCost > 0
                        ? `${untaggedMV - untaggedCost >= 0 ? "+" : ""}${(((untaggedMV - untaggedCost) / untaggedCost) * 100).toFixed(1)}%`
                        : "-"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tags.length === 0 && !tagAggregates.length && (
        <p className="text-sm text-gray-500">No tags yet.</p>
      )}

      <div className="space-y-4">
        {tags.map((tag) => (
          <div key={tag.id} className="bg-white rounded-lg border p-3">
            <div className="flex justify-between items-center mb-2">
              <span className="font-medium">{tag.name}</span>
              <button
                className="text-red-500 text-xs hover:underline cursor-pointer"
                onClick={() => deleteMutation.mutate(tag.id)}
              >
                Delete
              </button>
            </div>
            {tag.symbols && tag.symbols.length > 0 ? (
              <div className="flex flex-wrap gap-1 mb-2">
                {tag.symbols.map((s) => (
                  <span
                    key={s}
                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs"
                  >
                    {s}
                    <button
                      className="text-blue-400 hover:text-blue-700 cursor-pointer"
                      onClick={() => unassignMutation.mutate({ tagId: tag.id, symbol: s })}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400 mb-2">No stocks assigned</p>
            )}
            <div className="flex gap-1">
              <input
                type="text"
                value={assignSymbols[tag.id] ?? ""}
                onChange={(e) =>
                  setAssignSymbols((prev) => ({ ...prev, [tag.id]: e.target.value.toUpperCase() }))
                }
                placeholder="Add symbol"
                className="border rounded px-2 py-1 text-xs flex-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (assignSymbols[tag.id] ?? "").trim()) {
                    assignMutation.mutate({
                      tagId: tag.id,
                      symbol: (assignSymbols[tag.id] ?? "").trim(),
                    });
                  }
                }}
              />
              <button
                className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 cursor-pointer disabled:opacity-50"
                disabled={!(assignSymbols[tag.id] ?? "").trim() || assignMutation.isPending}
                onClick={() =>
                  assignMutation.mutate({
                    tagId: tag.id,
                    symbol: (assignSymbols[tag.id] ?? "").trim(),
                  })
                }
              >
                +
              </button>
            </div>
          </div>
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
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-6 w-full max-w-sm shadow-xl">
        <p className="mb-4">{message}</p>
        <div className="flex justify-end gap-3">
          <button
            className="px-4 py-2 text-gray-600 rounded hover:bg-gray-100 cursor-pointer"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 cursor-pointer"
            onClick={onConfirm}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
