import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, Wrench, Check } from "lucide-react";
import { Badge } from "../../components/ui/badge";
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
import type { Transfer } from "./types";
import { ConfirmModal } from "./ConfirmModal";

function AddTransferModal({
  portfolioId,
  onClose,
  onCreated,
}: {
  portfolioId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [type, setType] = useState<"deposit" | "withdrawal" | "initial">("deposit");
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
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Transfer</DialogTitle>
        </DialogHeader>
        {mutation.error && <p className="text-sm text-destructive">{mutation.error.message}</p>}
        <div className="space-y-3">
          <div>
            <Label htmlFor="transfer-type">Type</Label>
            <Select
              id="transfer-type"
              value={type}
              onChange={(e) => setType(e.target.value as "deposit" | "withdrawal" | "initial")}
            >
              <option value="deposit">Deposit</option>
              <option value="withdrawal">Withdrawal</option>
              <option value="initial">Initial</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="transfer-amount">Amount</Label>
            <Input
              id="transfer-amount"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="10000"
            />
          </div>
          <div>
            <Label htmlFor="transfer-fee">Fee</Label>
            <Input
              id="transfer-fee"
              type="number"
              value={fee}
              onChange={(e) => setFee(e.target.value)}
              placeholder="0"
            />
          </div>
          <div>
            <Label htmlFor="transfer-date">Date</Label>
            <Input
              id="transfer-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="transfer-note">Note (optional)</Label>
            <Input
              id="transfer-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Initial funding"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!amount || parseFloat(amount) <= 0 || mutation.isPending}
            onClick={handleSubmit}
          >
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TransfersTab({ id, currency }: { id: string; currency: string }) {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [manageMode, setManageMode] = useState(false);

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

  const transfersWithRunningTotal = useMemo(() => {
    const transfers = data?.data ?? [];
    // Sort ascending to calculate running total from oldest to newest
    const sorted = [...transfers].sort((a, b) => a.date.localeCompare(b.date));
    let runningTotal = 0;
    const withRunningTotal = sorted.map((t) => {
      const netEffect =
        t.type === "deposit" || t.type === "initial" ? t.amount - t.fee : -(t.amount + t.fee);
      runningTotal += netEffect;
      return { ...t, runningTotal };
    });
    // Reverse to display newest first
    return withRunningTotal.reverse();
  }, [data?.data]);

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading...</p>;

  return (
    <div>
      <div className="mb-4 flex justify-between">
        <h3 className="font-semibold">Transfers</h3>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setManageMode(!manageMode)}>
            {manageMode ? <Check className="h-4 w-4" /> : <Wrench className="h-4 w-4" />}
            {manageMode ? "Done" : "Manage"}
          </Button>
          <Button size="sm" onClick={() => setShowAdd(true)}>
            Add Transfer
          </Button>
        </div>
      </div>

      {data?.data.length === 0 && <EmptyState message="No transfers yet." />}

      <div className="space-y-1">
        <div
          className={`grid items-center gap-2 border-b py-2 text-xs font-medium text-muted-foreground ${manageMode ? "grid-cols-[90px_90px_1fr_60px_100px_80px_100px_100px_100px_32px]" : "grid-cols-[90px_90px_1fr_60px_100px_80px_100px_100px_100px]"}`}
        >
          <span>Date</span>
          <span>Type</span>
          <span>Note</span>
          <span>Currency</span>
          <span className="text-right">Amount</span>
          <span className="text-right">Fee</span>
          <span className="text-right">Net</span>
          <span className="text-right">Investment</span>
          <span className="text-right">Cash</span>
          {manageMode && <span />}
        </div>
        {transfersWithRunningTotal.map((t) => {
          const netEffect =
            t.type === "deposit" || t.type === "initial" ? t.amount - t.fee : -(t.amount + t.fee);
          return (
            <div
              key={t.id}
              className={`grid items-center gap-2 border-b py-2 text-sm ${manageMode ? "grid-cols-[90px_90px_1fr_60px_100px_80px_100px_100px_100px_32px]" : "grid-cols-[90px_90px_1fr_60px_100px_80px_100px_100px_100px]"}`}
            >
              <span className="text-muted-foreground">{t.date}</span>
              <Badge
                variant="secondary"
                className={`w-fit border-transparent ${
                  t.type === "deposit" || t.type === "initial"
                    ? "bg-green-100 text-green-700"
                    : "bg-red-100 text-red-700"
                }`}
              >
                {t.type}
              </Badge>
              <span className="truncate text-muted-foreground">{t.note || ""}</span>
              <span>{currency}</span>
              <span className="text-right">{t.amount.toLocaleString()}</span>
              <span className="text-right text-muted-foreground">{t.fee > 0 ? t.fee : ""}</span>
              <span className={`text-right ${netEffect >= 0 ? "text-green-600" : "text-red-600"}`}>
                {netEffect >= 0 ? "+" : ""}
                {netEffect.toLocaleString()}
              </span>
              <span className="text-right font-medium">
                {Math.round(t.runningTotal).toLocaleString()}
              </span>
              <span className="text-right text-muted-foreground">
                {t.cash_balance !== undefined ? t.cash_balance.toLocaleString() : ""}
              </span>
              {manageMode && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-destructive"
                  onClick={() => setDeleteId(t.id)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              )}
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
