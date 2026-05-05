import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Trash2, Wrench, Check } from "lucide-react";
import { Button } from "../../components/ui/button";
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
import { Select } from "../../components/ui/select";
import { get, post, del } from "../../lib/api";
import type { Transaction } from "../../../../shared/types/api";
import { ConfirmModal } from "./ConfirmModal";
import { TransactionTypeBadge } from "./TransactionTypeBadge";

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

export function TransactionsTab({
  id,
  selectedSymbols,
  onSelectedSymbolsChange,
}: {
  id: string;
  selectedSymbols: Set<string>;
  onSelectedSymbolsChange: (symbols: Set<string>) => void;
}) {
  const queryClient = useQueryClient();
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [datePreset, setDatePreset] = useState<
    "1M" | "3M" | "6M" | "YTD" | "1Y" | "3Y" | "ALL" | "CUSTOM"
  >("ALL");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [showTypeFilter, setShowTypeFilter] = useState(false);
  const [showSymbolFilter, setShowSymbolFilter] = useState(false);
  const [manageMode, setManageMode] = useState(false);

  const transactionTypes = ["buy", "sell", "dividend", "initial"] as const;

  const { data: symbolsData } = useQuery({
    queryKey: ["transaction-symbols", id],
    queryFn: () => get<{ data: string[] }>(`/portfolios/${id}/transactions/symbols`),
  });
  const symbols = symbolsData?.data ?? [];

  const startDate = useMemo(() => {
    const today = new Date();
    let start: Date;
    switch (datePreset) {
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
      case "3Y":
        start = new Date(today.getFullYear() - 3, today.getMonth(), today.getDate());
        break;
      case "ALL":
        return undefined;
      case "CUSTOM":
        return customStart || undefined;
    }
    return start.toISOString().split("T")[0];
  }, [datePreset, customStart]);

  const endDate = datePreset === "CUSTOM" ? customEnd || undefined : undefined;

  const params = new URLSearchParams();
  if (startDate) params.set("startDate", startDate);
  if (endDate) params.set("endDate", endDate);
  const queryString = params.toString() ? `?${params.toString()}` : "";

  const { data, isLoading } = useQuery({
    queryKey: ["transactions", id, startDate, endDate],
    queryFn: () => get<{ data: Transaction[] }>(`/portfolios/${id}/transactions${queryString}`),
  });

  const filteredTransactions = useMemo(() => {
    let filtered = data?.data ?? [];
    if (selectedSymbols.size > 0) {
      filtered = filtered.filter((tx) => selectedSymbols.has(tx.symbol));
    }
    if (selectedTypes.size > 0) {
      filtered = filtered.filter((tx) => selectedTypes.has(tx.type));
    }
    return filtered;
  }, [data?.data, selectedSymbols, selectedTypes]);

  const deleteMutation = useMutation({
    mutationFn: (txId: number) => del<{ data: null }>(`/portfolios/${id}/transactions/${txId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions", id] });
      setDeleteId(null);
    },
  });

  function toggleSymbol(symbol: string) {
    const next = new Set(selectedSymbols);
    if (next.has(symbol)) {
      next.delete(symbol);
    } else {
      next.add(symbol);
    }
    onSelectedSymbolsChange(next);
  }

  function toggleType(type: string) {
    const next = new Set(selectedTypes);
    if (next.has(type)) {
      next.delete(type);
    } else {
      next.add(type);
    }
    setSelectedTypes(next);
  }

  if (isLoading && !data) return <p className="text-sm text-muted-foreground">Loading...</p>;

  return (
    <div>
      <div className="mb-4 flex justify-between">
        <h3 className="font-semibold">Transactions</h3>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setManageMode(!manageMode)}>
            {manageMode ? <Check className="h-4 w-4" /> : <Wrench className="h-4 w-4" />}
            {manageMode ? "Done" : "Manage"}
          </Button>
          <Button size="sm" onClick={() => setShowAdd(true)}>
            Add Transaction
          </Button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1">
          {(["1M", "3M", "6M", "YTD", "1Y", "3Y", "ALL"] as const).map((r) => (
            <Button
              key={r}
              size="sm"
              variant={datePreset === r ? "default" : "outline"}
              className="h-6 px-2 text-xs"
              onClick={() => setDatePreset(r)}
            >
              {r}
            </Button>
          ))}
          <Button
            size="sm"
            variant={datePreset === "CUSTOM" ? "default" : "outline"}
            className="h-6 px-2 text-xs"
            onClick={() => setDatePreset("CUSTOM")}
          >
            Custom
          </Button>
        </div>

        <div className="flex gap-2">
          <Button
            size="sm"
            variant={showTypeFilter ? "default" : "outline"}
            className="h-6 px-2 text-xs"
            onClick={() => setShowTypeFilter(!showTypeFilter)}
          >
            Type
            {selectedTypes.size > 0 && (
              <span className="ml-1 rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">
                {selectedTypes.size}
              </span>
            )}
            {showTypeFilter ? (
              <ChevronUp className="ml-1 h-3 w-3" />
            ) : (
              <ChevronDown className="ml-1 h-3 w-3" />
            )}
          </Button>

          {symbols.length > 1 && (
            <Button
              size="sm"
              variant={showSymbolFilter ? "default" : "outline"}
              className="h-6 px-2 text-xs"
              onClick={() => setShowSymbolFilter(!showSymbolFilter)}
            >
              Symbol
              {selectedSymbols.size > 0 && (
                <span className="ml-1 rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">
                  {selectedSymbols.size}
                </span>
              )}
              {showSymbolFilter ? (
                <ChevronUp className="ml-1 h-3 w-3" />
              ) : (
                <ChevronDown className="ml-1 h-3 w-3" />
              )}
            </Button>
          )}
        </div>
      </div>

      {datePreset === "CUSTOM" && (
        <div className="mb-3 flex items-center justify-end gap-2">
          <Input
            type="date"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            className="h-6 w-auto text-xs"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <Input
            type="date"
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
            className="h-6 w-auto text-xs"
          />
        </div>
      )}

      {showTypeFilter && (
        <div className="mb-3 flex flex-wrap justify-end gap-1">
          <Button
            size="sm"
            variant={selectedTypes.size === 0 ? "default" : "outline"}
            className="h-6 px-2 text-xs"
            onClick={() => setSelectedTypes(new Set())}
          >
            All
          </Button>
          {transactionTypes.map((type) => (
            <Button
              key={type}
              size="sm"
              variant={selectedTypes.has(type) ? "default" : "outline"}
              className="h-6 px-2 text-xs capitalize"
              onClick={() => toggleType(type)}
            >
              {type}
            </Button>
          ))}
        </div>
      )}

      {showSymbolFilter && symbols.length > 1 && (
        <div className="mb-3 flex flex-wrap justify-end gap-1">
          <Button
            size="sm"
            variant={selectedSymbols.size === 0 ? "default" : "outline"}
            className="h-6 px-2 text-[10px]"
            onClick={() => onSelectedSymbolsChange(new Set())}
          >
            All
          </Button>
          {symbols.map((symbol) => (
            <Button
              key={symbol}
              size="sm"
              variant={selectedSymbols.has(symbol) ? "default" : "outline"}
              className="h-6 px-2 text-[10px]"
              onClick={() => toggleSymbol(symbol)}
            >
              {symbol}
            </Button>
          ))}
        </div>
      )}

      <div className="space-y-1">
        <div
          className={`grid items-center gap-2 border-b py-2 text-xs font-medium text-muted-foreground ${manageMode ? "grid-cols-[90px_1fr_70px_80px_80px_80px_100px_32px]" : "grid-cols-[90px_1fr_70px_80px_80px_80px_100px]"}`}
        >
          <span>Date</span>
          <span>Symbol</span>
          <span>Type</span>
          <span className="text-right">Qty</span>
          <span className="text-right">Price</span>
          <span className="text-right">Fee</span>
          <span className="text-right">Proceeds</span>
          {manageMode && <span />}
        </div>
        {filteredTransactions.map((tx) => {
          const proceeds =
            tx.type === "buy" || tx.type === "initial"
              ? -(tx.quantity * tx.price + tx.fee)
              : tx.quantity * tx.price - tx.fee;
          return (
            <div
              key={tx.id}
              className={`grid items-center gap-2 border-b py-2 text-sm ${manageMode ? "grid-cols-[90px_1fr_70px_80px_80px_80px_100px_32px]" : "grid-cols-[90px_1fr_70px_80px_80px_80px_100px]"}`}
            >
              <span className="text-muted-foreground">{tx.date}</span>
              <div className="min-w-0">
                <div className="truncate font-medium">{tx.symbol}</div>
                <div className="truncate text-xs text-muted-foreground">{tx.name}</div>
              </div>
              <TransactionTypeBadge type={tx.type} />
              <span className="text-right tabular-nums">{tx.quantity}</span>
              <span className="text-right tabular-nums">{tx.price.toFixed(3)}</span>
              <span className="text-right tabular-nums text-muted-foreground">
                {tx.fee > 0 ? tx.fee : ""}
              </span>
              <span
                className={`text-right tabular-nums ${proceeds >= 0 ? "text-green-600" : "text-red-600"}`}
              >
                {proceeds >= 0 ? "+" : ""}
                {proceeds.toLocaleString()}
              </span>
              {manageMode && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-destructive"
                  onClick={() => setDeleteId(tx.id)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              )}
            </div>
          );
        })}
        {filteredTransactions.length === 0 && <EmptyState message="No transactions yet." />}
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
