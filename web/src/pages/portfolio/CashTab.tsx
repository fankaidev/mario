import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { EmptyState } from "../../components/EmptyState";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { get } from "../../lib/api";
import type { CashMovement, CashMovementType } from "../../../../shared/types/api";

function CashMovementTypeBadge({ type }: { type: string }) {
  const className =
    type === "snapshot"
      ? "bg-gray-100 text-gray-600"
      : type === "deposit" || type === "sell" || type === "dividend" || type === "interest"
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
    "interest",
    "snapshot",
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

      {filteredMovements.length > 0 && (
        <>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Currency</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMovements.map((m) => (
                  <TableRow key={`${m.type}-${m.id}`}>
                    <TableCell className="text-muted-foreground">{m.date}</TableCell>
                    <TableCell>
                      <CashMovementTypeBadge type={m.type} />
                    </TableCell>
                    <TableCell className="truncate">
                      {m.symbol ??
                        m.note ??
                        (m.type === "deposit"
                          ? "Deposit"
                          : m.type === "initial"
                            ? "Initial"
                            : m.type === "interest"
                              ? "Interest"
                              : "Withdrawal")}
                    </TableCell>
                    <TableCell>{currency}</TableCell>
                    <TableCell
                      className={`text-right tabular-nums ${m.amount >= 0 ? "text-green-600" : "text-red-600"}`}
                    >
                      {m.amount >= 0 ? "+" : ""}
                      {m.amount.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {m.cash_balance.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="space-y-2 md:hidden">
            {filteredMovements.map((m) => (
              <Card key={`${m.type}-${m.id}`}>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CashMovementTypeBadge type={m.type} />
                      <span className="text-xs text-muted-foreground">{m.date}</span>
                    </div>
                    <span
                      className={`tabular-nums font-medium ${m.amount >= 0 ? "text-green-600" : "text-red-600"}`}
                    >
                      {m.amount >= 0 ? "+" : ""}
                      {m.amount.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{" "}
                      {currency}
                    </span>
                  </div>
                  <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                    <span className="truncate">
                      {m.symbol ??
                        m.note ??
                        (m.type === "deposit"
                          ? "Deposit"
                          : m.type === "initial"
                            ? "Initial"
                            : m.type === "interest"
                              ? "Interest"
                              : "Withdrawal")}
                    </span>
                    <span className="tabular-nums">
                      Balance:{" "}
                      {m.cash_balance.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {filteredMovements.length === 0 && data?.data.length !== 0 && (
        <EmptyState message="No movements match the current filters." />
      )}
    </div>
  );
}
