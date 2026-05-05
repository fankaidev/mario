import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { get, post } from "../../lib/api";
import type { CorporateAction } from "../../../../shared/types/api";

function AddCorporateActionModal({
  portfolioId,
  onClose,
  onCreated,
}: {
  portfolioId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [type, setType] = useState<"split" | "merge">("split");
  const [symbol, setSymbol] = useState("");
  const [ratio, setRatio] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().split("T")[0] ?? "");

  const mutation = useMutation({
    mutationFn: (body: unknown) => post(`/portfolios/${portfolioId}/corporate-actions`, body),
    onSuccess: onCreated,
  });

  const handleSubmit = () => {
    mutation.mutate({
      symbol: symbol.trim().toUpperCase(),
      type,
      ratio: parseFloat(ratio),
      effective_date: effectiveDate,
    });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Corporate Action</DialogTitle>
        </DialogHeader>
        {mutation.error && <p className="text-sm text-destructive">{mutation.error.message}</p>}
        <div className="space-y-3">
          <div>
            <Label htmlFor="ca-symbol">Symbol</Label>
            <Input
              id="ca-symbol"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              placeholder="AAPL"
            />
          </div>
          <div>
            <Label htmlFor="ca-type">Type</Label>
            <Select
              id="ca-type"
              value={type}
              onChange={(e) => setType(e.target.value as "split" | "merge")}
            >
              <option value="split">Split</option>
              <option value="merge">Merge (Reverse Split)</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="ca-ratio">Ratio</Label>
            <Input
              id="ca-ratio"
              type="number"
              step="0.01"
              value={ratio}
              onChange={(e) => setRatio(e.target.value)}
              placeholder="4"
            />
            <p className="text-xs text-muted-foreground">
              {type === "split" ? "e.g., 4 means 4:1 split" : "e.g., 4 means 1:4 reverse split"}
            </p>
          </div>
          <div>
            <Label htmlFor="ca-date">Effective Date</Label>
            <Input
              id="ca-date"
              type="date"
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!symbol || !ratio || parseFloat(ratio) <= 0 || mutation.isPending}
            onClick={handleSubmit}
          >
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CorporateActionsTab({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["corporate-actions", id],
    queryFn: () => get<{ data: CorporateAction[] }>(`/portfolios/${id}/corporate-actions`),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading...</p>;

  const actions = data?.data ?? [];

  return (
    <div>
      <div className="mb-4 flex justify-between">
        <h3 className="font-semibold">Corporate Actions</h3>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          Add Action
        </Button>
      </div>

      {actions.length === 0 && <EmptyState message="No corporate actions yet." />}

      {actions.length > 0 && (
        <>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Ratio</TableHead>
                  <TableHead className="text-right">Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {actions.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="text-muted-foreground">{a.effective_date}</TableCell>
                    <TableCell className="font-medium">{a.symbol}</TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={`w-fit border-transparent ${
                          a.type === "split"
                            ? "bg-green-100 text-green-700"
                            : "bg-blue-100 text-blue-700"
                        }`}
                      >
                        {a.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{a.ratio}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {new Date(a.created_at).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="space-y-2 md:hidden">
            {actions.map((a) => (
              <Card key={a.id}>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-medium">{a.symbol}</span>
                      <Badge
                        variant="secondary"
                        className={`ml-2 w-fit border-transparent ${
                          a.type === "split"
                            ? "bg-green-100 text-green-700"
                            : "bg-blue-100 text-blue-700"
                        }`}
                      >
                        {a.type}
                      </Badge>
                    </div>
                    <span className="tabular-nums">{a.ratio}</span>
                  </div>
                  <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                    <span>{a.effective_date}</span>
                    <span>Created {new Date(a.created_at).toLocaleDateString()}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {showAdd && (
        <AddCorporateActionModal
          portfolioId={id}
          onClose={() => setShowAdd(false)}
          onCreated={() => {
            queryClient.invalidateQueries({ queryKey: ["corporate-actions", id] });
            queryClient.invalidateQueries({ queryKey: ["holdings", id] });
            queryClient.invalidateQueries({ queryKey: ["summary", id] });
            setShowAdd(false);
          }}
        />
      )}
    </div>
  );
}
