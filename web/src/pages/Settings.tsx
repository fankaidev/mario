import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

  if (isLoading) return <p className="p-4 text-gray-500">Loading...</p>;
  if (error) return <p className="p-4 text-red-500">Failed to load tokens</p>;

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      <section>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">API Tokens</h2>
          <button
            className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 cursor-pointer"
            onClick={() => setShowCreate(true)}
          >
            Create Token
          </button>
        </div>

        {data?.data.length === 0 && <p className="text-gray-500 text-sm">No tokens created yet.</p>}

        <div className="space-y-2">
          {data?.data.map((t) => (
            <div key={t.id} className="flex items-center justify-between p-3 border rounded">
              <div>
                <p className="font-medium">{t.name}</p>
                <p className="text-xs text-gray-400">
                  Created {new Date(t.created_at).toLocaleDateString()}
                  {t.last_used_at &&
                    ` · Last used ${new Date(t.last_used_at).toLocaleDateString()}`}
                </p>
              </div>
              <button
                className="text-red-500 text-sm hover:underline cursor-pointer"
                onClick={() => setDeleteId(t.id)}
              >
                Revoke
              </button>
            </div>
          ))}
        </div>
      </section>

      {showCreate && (
        <CreateTokenModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
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

function CreateTokenModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const mutation = useMutation({
    mutationFn: (body: { name: string }) => post<{ data: { token: string } }>("/tokens", body),
    onSuccess: (data) => {
      setToken(data.data.token);
      onCreated();
    },
  });

  const copy = async () => {
    if (!token) return;
    await navigator.clipboard.writeText(token);
    setCopied(true);
  };

  if (token) {
    return (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-xl">
          <h2 className="text-xl font-semibold mb-2">Token Created</h2>
          <p className="text-sm text-gray-500 mb-4">
            Copy this token now — it won't be shown again.
          </p>
          <div className="bg-gray-100 p-3 rounded mb-4 text-sm font-mono break-all">{token}</div>
          <button
            className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 cursor-pointer mb-2"
            onClick={copy}
          >
            {copied ? "Copied!" : "Copy to Clipboard"}
          </button>
          <button
            className="w-full px-4 py-2 text-gray-600 rounded hover:bg-gray-100 cursor-pointer"
            onClick={onClose}
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-xl">
        <h2 className="text-xl font-semibold mb-4">Create API Token</h2>
        {mutation.error && <p className="mb-3 text-red-500 text-sm">{mutation.error.message}</p>}
        <label className="block mb-2 text-sm font-medium">Token Name</label>
        <input
          className="w-full border rounded px-3 py-2 mb-4"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. CLI Tool"
        />
        <div className="flex justify-end gap-3">
          <button
            className="px-4 py-2 text-gray-600 rounded hover:bg-gray-100 cursor-pointer"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 cursor-pointer disabled:opacity-50"
            disabled={!name.trim() || mutation.isPending}
            onClick={() => mutation.mutate({ name: name.trim() })}
          >
            Create
          </button>
        </div>
      </div>
    </div>
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
            Revoke
          </button>
        </div>
      </div>
    </div>
  );
}
