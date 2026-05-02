import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select } from "../components/ui/select";
import { get, post } from "../lib/api";
import type { Portfolio } from "../../../shared/types/api";

export function PortfolioList() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["portfolios"],
    queryFn: () => get<{ data: Portfolio[] }>("/portfolios"),
  });

  const createMutation = useMutation({
    mutationFn: (body: { name: string; currency: string }) =>
      post<{ data: Portfolio }>("/portfolios", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portfolios"] });
      setShowCreate(false);
    },
  });

  if (isLoading) return <p className="p-4 text-muted-foreground">Loading...</p>;
  if (error) return <p className="p-4 text-destructive">Failed to load portfolios</p>;

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">Portfolios</h1>
          <p className="mt-1 text-sm text-muted-foreground">Track assets by market and currency.</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" />
          New Portfolio
        </Button>
      </div>

      {data?.data.length === 0 && (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            No portfolios yet. Create one to get started.
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {data?.data.map((p) => (
          <Link key={p.id} to={`/portfolios/${p.id}`} className="block">
            <Card className="h-full transition-all hover:bg-accent hover:shadow-md">
              <CardHeader>
                <CardTitle className="text-lg">{p.name}</CardTitle>
                <CardDescription>{p.currency}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  Created {new Date(p.created_at).toLocaleDateString()}
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {showCreate && (
        <CreatePortfolioModal
          onClose={() => setShowCreate(false)}
          onCreate={(name, currency) => createMutation.mutate({ name, currency })}
          error={createMutation.error ? createMutation.error.message : undefined}
        />
      )}
    </div>
  );
}

function CreatePortfolioModal({
  onClose,
  onCreate,
  error,
}: {
  onClose: () => void;
  onCreate: (name: string, currency: string) => void;
  error: string | undefined;
}) {
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("USD");

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Portfolio</DialogTitle>
        </DialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="grid gap-2">
          <Label htmlFor="portfolio-name">Name</Label>
          <Input
            id="portfolio-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Portfolio"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="portfolio-currency">Currency</Label>
          <Select
            id="portfolio-currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          >
            <option value="USD">USD</option>
            <option value="HKD">HKD</option>
            <option value="CNY">CNY</option>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!name.trim()} onClick={() => onCreate(name.trim(), currency)}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
