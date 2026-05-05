import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { EmptyState } from "../../components/EmptyState";
import { get } from "../../lib/api";
import type { CashMovement, CashMovementType } from "../../../../shared/types/api";

function CashMovementTypeBadge({ type }: { type: string }) {
  const className =
    type === "deposit" || type === "sell" || type === "dividend"
      ? "bg-green-100 text-green-700"
      : type === "withdrawal" || type === "buy" || type === "initial"
        ? "bg-red-100 text-red-700"
        : "bg-blue-100 text-blue-700";

  return (
    <Badge variant="secondary" className={`w-fit border-transparent ${className}`}>
      {type}
    </Badge>
  );
}

export function CashTab({ id, currency }: { id: string; currency: string }) {
  const [datePreset, setDatePreset] = useState<
    "1M" | "3M" | "6M" | "YTD" | "1Y" | "3Y" | "ALL" | "CUSTOM"
  >("ALL");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<Set<CashMovementType>>(new Set());

  const ALL_TYPES: CashMovementType[] = [
    "deposit",
    "withdrawal",
    "buy",
    "sell",
    "dividend",
    "initial",
  ];

  const toggleType = (type: CashMovementType) => {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  const { data, isLoading } = useQuery({
    queryKey: ["cash-movements", id],
    queryFn: () => get<{ data: CashMovement[] }>(`/portfolios/${id}/cash-movements`),
  });

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

  const filteredMovements = useMemo(() => {
    let filtered = data?.data ?? [];
    if (startDate) {
      filtered = filtered.filter((m) => m.date >= startDate);
    }
    if (endDate) {
      filtered = filtered.filter((m) => m.date <= endDate);
    }
    if (selectedTypes.size > 0) {
      filtered = filtered.filter((m) => selectedTypes.has(m.type));
    }
    return filtered;
  }, [data?.data, startDate, endDate, selectedTypes]);

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading...</p>;

  return (
    <div>
      <div className="mb-4">
        <h3 className="font-semibold">Cash Movements</h3>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-1">
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

      <div className="mb-3 flex flex-wrap items-center gap-1">
        {ALL_TYPES.map((type) => (
          <Button
            key={type}
            size="sm"
            variant={selectedTypes.has(type) ? "default" : "outline"}
            className="h-6 px-2 text-xs"
            onClick={() => toggleType(type)}
          >
            {type}
          </Button>
        ))}
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

      {data?.data.length === 0 && <EmptyState message="No cash movements yet." />}

      <div className="space-y-1">
        <div className="grid items-center gap-2 border-b py-2 text-xs font-medium text-muted-foreground grid-cols-[90px_90px_1fr_60px_100px_100px]">
          <span>Date</span>
          <span>Type</span>
          <span>Description</span>
          <span>Currency</span>
          <span className="text-right">Amount</span>
          <span className="text-right">Balance</span>
        </div>
        {filteredMovements.map((m) => (
          <div
            key={`${m.type}-${m.id}`}
            className="grid items-center gap-2 border-b py-2 text-sm grid-cols-[90px_90px_1fr_60px_100px_100px]"
          >
            <span className="text-muted-foreground">{m.date}</span>
            <CashMovementTypeBadge type={m.type} />
            <span className="truncate">
              {m.symbol ?? m.note ?? (m.type === "deposit" ? "Deposit" : "Withdrawal")}
            </span>
            <span>{currency}</span>
            <span className={`text-right ${m.amount >= 0 ? "text-green-600" : "text-red-600"}`}>
              {m.amount >= 0 ? "+" : ""}
              {m.amount.toLocaleString()}
            </span>
            <span className="text-right font-medium">
              {m.cash_balance.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          </div>
        ))}
        {filteredMovements.length === 0 && data?.data.length !== 0 && (
          <EmptyState message="No movements match the current filters." />
        )}
      </div>
    </div>
  );
}
