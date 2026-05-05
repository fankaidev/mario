import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, Wrench, Check } from "lucide-react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { get, post, del } from "../../lib/api";
import type { CashTransfer } from "./types";
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
  const [type, setType] = useState<"deposit" | "withdrawal" | "initial" | "interest">("deposit");
  const [amount, setAmount] = useState("");
  const [fee, setFee] = useState("0");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0] ?? "");
  const [note, setNote] = useState("");

  const mutation = useMutation({
    mutationFn: (body: unknown) => post(`/portfolios/${portfolioId}/cash-transfers`, body),
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
              onChange={(e) =>
                setType(e.target.value as "deposit" | "withdrawal" | "initial" | "interest")
              }
            >
              <option value="deposit">Deposit</option>
              <option value="withdrawal">Withdrawal</option>
              <option value="initial">Initial</option>
              <option value="interest">Interest</option>
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

export function CashTransfersTab({ id, currency }: { id: string; currency: string }) {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [manageMode, setManageMode] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["cash-transfers", id],
    queryFn: () => get<{ data: CashTransfer[] }>(`/portfolios/${id}/cash-transfers`),
  });

  const deleteMutation = useMutation({
    mutationFn: (transferId: number) =>
      del<{ data: null }>(`/portfolios/${id}/cash-transfers/${transferId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cash-transfers", id] });
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
      const netEffect = t.type === "withdrawal" ? -(t.amount + t.fee) : t.amount - t.fee;
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

      {transfersWithRunningTotal.length > 0 && (
        <>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead>Currency</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Fee</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                  <TableHead className="text-right">Investment</TableHead>
                  {manageMode && <TableHead />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {transfersWithRunningTotal.map((t) => {
                  const netEffect =
                    t.type === "withdrawal" ? -(t.amount + t.fee) : t.amount - t.fee;
                  const fmtVal = (v: number) =>
                    v.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    });
                  return (
                    <TableRow key={t.id}>
                      <TableCell className="text-muted-foreground">{t.date}</TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={`w-fit border-transparent ${
                            t.type === "withdrawal"
                              ? "bg-red-100 text-red-700"
                              : "bg-green-100 text-green-700"
                          }`}
                        >
                          {t.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="truncate text-muted-foreground">
                        {t.note || ""}
                      </TableCell>
                      <TableCell>{currency}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtVal(t.amount)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {t.fee > 0 ? fmtVal(t.fee) : ""}
                      </TableCell>
                      <TableCell
                        className={`text-right tabular-nums ${netEffect >= 0 ? "text-green-600" : "text-red-600"}`}
                      >
                        {netEffect >= 0 ? "+" : ""}
                        {fmtVal(netEffect)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {fmtVal(t.runningTotal)}
                      </TableCell>
                      {manageMode && (
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-destructive"
                            onClick={() => setDeleteId(t.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="space-y-2 md:hidden">
            {transfersWithRunningTotal.map((t) => {
              const netEffect = t.type === "withdrawal" ? -(t.amount + t.fee) : t.amount - t.fee;
              const fmtVal = (v: number) =>
                v.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                });
              return (
                <Card key={t.id}>
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="secondary"
                          className={`w-fit border-transparent ${
                            t.type === "withdrawal"
                              ? "bg-red-100 text-red-700"
                              : "bg-green-100 text-green-700"
                          }`}
                        >
                          {t.type}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{t.date}</span>
                      </div>
                      <span
                        className={`tabular-nums font-medium ${netEffect >= 0 ? "text-green-600" : "text-red-600"}`}
                      >
                        {netEffect >= 0 ? "+" : ""}
                        {fmtVal(netEffect)} {currency}
                      </span>
                    </div>
                    <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                      <span className="truncate">{t.note || ""}</span>
                      <span className="tabular-nums">Inv: {fmtVal(t.runningTotal)}</span>
                    </div>
                    {t.fee > 0 && (
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        Amount: {fmtVal(t.amount)} · Fee: {fmtVal(t.fee)}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {showAdd && (
        <AddTransferModal
          portfolioId={id}
          onClose={() => setShowAdd(false)}
          onCreated={() => {
            queryClient.invalidateQueries({ queryKey: ["cash-transfers", id] });
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
