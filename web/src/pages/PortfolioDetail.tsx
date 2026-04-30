import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "react-router-dom";
import { LineChart } from "../components/LineChart";
import { get, post, del } from "../lib/api";

interface Holding {
  symbol: string;
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

type TabName = "holdings" | "transactions" | "snapshots" | "return" | "summary";

export function PortfolioDetail() {
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState<TabName>("holdings");
  const [symbolFilter, setSymbolFilter] = useState("");

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <Link to="/" className="text-blue-600 hover:underline text-sm">
          ← Back to Portfolios
        </Link>
        <h1 className="text-xl md:text-2xl font-bold mt-2 mb-4">Portfolio {id}</h1>

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

function HoldingsTab({
  id,
  onSelectSymbol,
}: {
  id: string;
  onSelectSymbol: (symbol: string) => void;
}) {
  const [sort, setSort] = useState("unrealizedPnlRate");

  const { data, isLoading } = useQuery({
    queryKey: ["holdings", id, sort],
    queryFn: () => get<{ data: Holding[] }>(`/portfolios/${id}/holdings?sort=${sort}`),
  });

  if (isLoading) return <p className="text-sm text-gray-500">Loading...</p>;

  return (
    <div>
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <Th label="Symbol" field="symbol" sort={sort} onSort={setSort} />
              <Th label="Qty" field="quantity" sort={sort} onSort={setSort} />
              <Th label="Cost" field="cost" sort={sort} onSort={setSort} />
              <Th label="Price" field="marketValue" sort={sort} onSort={setSort} />
              <Th label="P&L" field="unrealizedPnl" sort={sort} onSort={setSort} />
              <Th label="P&L%" field="unrealizedPnlRate" sort={sort} onSort={setSort} />
            </tr>
          </thead>
          <tbody>
            {data?.data.map((h) => (
              <tr key={h.symbol} className="border-b">
                <td className="py-2">
                  <button
                    className="font-medium text-blue-600 hover:underline cursor-pointer"
                    onClick={() => onSelectSymbol(h.symbol)}
                  >
                    {h.symbol}
                  </button>
                </td>
                <td className="py-2">{h.quantity}</td>
                <td className="py-2">{h.cost.toLocaleString()}</td>
                <td className="py-2">{h.market_value?.toLocaleString() ?? "-"}</td>
                <td
                  className={`py-2 ${(h.unrealized_pnl ?? 0) >= 0 ? "text-green-600" : "text-red-600"}`}
                >
                  {h.unrealized_pnl?.toLocaleString() ?? "-"}
                </td>
                <td
                  className={`py-2 ${(h.unrealized_pnl_rate ?? 0) >= 0 ? "text-green-600" : "text-red-600"}`}
                >
                  {h.unrealized_pnl_rate != null ? `${h.unrealized_pnl_rate}%` : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="md:hidden space-y-2">
        {data?.data.map((h) => (
          <div key={h.symbol} className="bg-white rounded-lg border p-3">
            <div className="flex justify-between items-center mb-2">
              <button
                className="font-semibold text-blue-600 cursor-pointer"
                onClick={() => onSelectSymbol(h.symbol)}
              >
                {h.symbol}
              </button>
              <span className="text-sm text-gray-500">{h.quantity} shares</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Cost: {h.cost.toLocaleString()}</span>
              <span
                className={
                  h.unrealized_pnl != null && h.unrealized_pnl >= 0
                    ? "text-green-600"
                    : "text-red-600"
                }
              >
                P&L: {h.unrealized_pnl?.toLocaleString() ?? "-"} (
                {h.unrealized_pnl_rate != null ? `${h.unrealized_pnl_rate}%` : "-"})
              </span>
            </div>
          </div>
        ))}
      </div>

      {data?.data.length === 0 && (
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
  field: string;
  sort: string;
  onSort: (f: string) => void;
}) {
  return (
    <th className="py-2 pr-4 cursor-pointer select-none" onClick={() => onSort(field)}>
      {label} {sort === field ? "↓" : ""}
    </th>
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

  const queryString = symbolFilter ? `?symbol=${encodeURIComponent(symbolFilter)}` : "";

  const { data, isLoading } = useQuery({
    queryKey: ["transactions", id, symbolFilter],
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

      <div className="mb-4">
        <input
          type="text"
          value={symbolFilter}
          onChange={(e) => onSymbolFilterChange(e.target.value.toUpperCase())}
          placeholder="Filter by symbol"
          className="w-full max-w-xs border rounded px-3 py-2 text-sm"
        />
      </div>

      <div className="space-y-1">
        {data?.data.map((tx) => (
          <div key={tx.id} className="flex items-center justify-between py-2 border-b text-sm">
            <div>
              <span className="font-medium">{tx.symbol}</span>
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
