import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "react-router-dom";
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

export function PortfolioDetail() {
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState<"holdings" | "transactions" | "summary">("holdings");

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <Link to="/" className="text-blue-600 hover:underline text-sm">
        ← Back to Portfolios
      </Link>
      <h1 className="text-2xl font-bold mt-2 mb-4">Portfolio {id}</h1>

      <div className="flex gap-1 border-b mb-6">
        {(["holdings", "transactions", "summary"] as const).map((t) => (
          <button
            key={t}
            className={`px-4 py-2 text-sm capitalize cursor-pointer ${tab === t ? "border-b-2 border-blue-600 text-blue-600" : "text-gray-500"}`}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "holdings" && <HoldingsTab id={id!} />}
      {tab === "transactions" && <TransactionsTab id={id!} />}
      {tab === "summary" && <SummaryTab id={id!} />}
    </div>
  );
}

function HoldingsTab({ id }: { id: string }) {
  const [sort, setSort] = useState("unrealizedPnlRate");

  const { data, isLoading } = useQuery({
    queryKey: ["holdings", id, sort],
    queryFn: () => get<{ data: Holding[] }>(`/portfolios/${id}/holdings?sort=${sort}`),
  });

  if (isLoading) return <p>Loading...</p>;

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <Th label="Symbol" field="symbol" sort={sort} onSort={setSort} />
              <Th label="Qty" field="quantity" sort={sort} onSort={setSort} />
              <Th label="Cost" field="cost" sort={sort} onSort={setSort} />
              <Th label="Market" field="marketValue" sort={sort} onSort={setSort} />
              <Th label="P&L" field="unrealizedPnl" sort={sort} onSort={setSort} />
              <Th label="P&L%" field="unrealizedPnlRate" sort={sort} onSort={setSort} />
            </tr>
          </thead>
          <tbody>
            {data?.data.map((h) => (
              <tr key={h.symbol} className="border-b">
                <td className="py-2 font-medium">{h.symbol}</td>
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
            {data?.data.length === 0 && (
              <tr>
                <td colSpan={6} className="py-4 text-gray-500 text-center">
                  No holdings
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
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

function TransactionsTab({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["transactions", id],
    queryFn: () => get<{ data: Transaction[] }>(`/portfolios/${id}/transactions`),
  });

  const deleteMutation = useMutation({
    mutationFn: (txId: number) => del<{ data: null }>(`/portfolios/${id}/transactions/${txId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions", id] });
      setDeleteId(null);
    },
  });

  if (isLoading) return <p>Loading...</p>;

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

      <div className="space-y-1">
        {data?.data.map((tx) => (
          <div key={tx.id} className="flex items-center justify-between py-2 border-b text-sm">
            <div>
              <span className="font-medium">{tx.symbol}</span>
              <span
                className={`ml-2 px-1.5 py-0.5 rounded text-xs ${tx.type === "buy" ? "bg-green-100 text-green-700" : tx.type === "sell" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"}`}
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
        {data?.data.length === 0 && <p className="text-gray-500 text-sm">No transactions yet.</p>}
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
  const [type, setType] = useState<"buy" | "sell" | "dividend">("buy");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [fee, setFee] = useState("0");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);

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
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
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
              onChange={(e) => setType(e.target.value as "buy" | "sell" | "dividend")}
            >
              <option value="buy">Buy</option>
              <option value="sell">Sell</option>
              <option value="dividend">Dividend</option>
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

  if (isLoading) return <p>Loading...</p>;

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
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
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
