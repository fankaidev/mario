import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, KeyRound, Plus, Trash2 } from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { get, post, del } from "../lib/api";

interface Token {
  id: number;
  name: string;
  created_at: string;
  last_used_at: string | null;
}

export function Settings() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["tokens"],
    queryFn: () => get<{ data: Token[] }>("/tokens"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => del<{ data: null }>(`/tokens/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tokens"] });
      setDeleteId(null);
    },
  });

  if (isLoading) return <p className="p-4 text-muted-foreground">Loading...</p>;
  if (error) return <p className="p-4 text-destructive">Failed to load tokens</p>;

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-6">
      <h1 className="mb-6 text-2xl font-semibold tracking-normal">Settings</h1>

      <section>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">API Tokens</h2>
            <p className="text-sm text-muted-foreground">Manage bearer tokens for remote access.</p>
          </div>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" />
            Create Token
          </Button>
        </div>

        {data?.data.length === 0 && (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              No tokens created yet.
            </CardContent>
          </Card>
        )}

        <div className="space-y-2">
          {data?.data.map((t) => (
            <Card key={t.id}>
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="rounded-md bg-secondary p-2 text-secondary-foreground">
                    <KeyRound className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium">{t.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Created {new Date(t.created_at).toLocaleDateString()}
                      {t.last_used_at &&
                        ` · Last used ${new Date(t.last_used_at).toLocaleDateString()}`}
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setDeleteId(t.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                  Revoke
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {showCreate && (
        <CreateTokenModal
          onClose={() => {
            queryClient.invalidateQueries({ queryKey: ["tokens"] });
            setShowCreate(false);
          }}
        />
      )}

      {deleteId !== null && (
        <ConfirmDelete
          message="Revoke this token? It will stop working immediately."
          onConfirm={() => deleteMutation.mutate(deleteId)}
          onCancel={() => setDeleteId(null)}
        />
      )}
    </div>
  );
}

function CreateTokenModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const mutation = useMutation({
    mutationFn: (body: { name: string }) => post<{ data: { token: string } }>("/tokens", body),
    onSuccess: (data) => {
      setToken(data.data.token);
    },
  });

  const copy = async () => {
    if (!token) return;
    await navigator.clipboard.writeText(token);
    setCopied(true);
  };

  if (token) {
    return (
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Token Created</DialogTitle>
            <DialogDescription>Copy this token now — it won't be shown again.</DialogDescription>
          </DialogHeader>
          <div className="rounded-md bg-muted p-3 font-mono text-sm break-all">{token}</div>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Done
            </Button>
            <Button onClick={copy}>
              <Copy className="h-4 w-4" />
              {copied ? "Copied!" : "Copy to Clipboard"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create API Token</DialogTitle>
        </DialogHeader>
        {mutation.error && <p className="text-sm text-destructive">{mutation.error.message}</p>}
        <div className="grid gap-2">
          <Label htmlFor="token-name">Token Name</Label>
          <Input
            id="token-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. CLI Tool"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!name.trim() || mutation.isPending}
            onClick={() => mutation.mutate({ name: name.trim() })}
          >
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConfirmDelete({
  message,
  onConfirm,
  onCancel,
}: {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Revoke Token</DialogTitle>
          <DialogDescription>{message}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            Revoke
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
