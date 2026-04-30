import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
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

  if (isLoading) return <p className="p-4 text-gray-500">Loading...</p>;
  if (error) return <p className="p-4 text-red-500">Failed to load portfolios</p>;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Portfolios</h1>
        <button
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 cursor-pointer"
          onClick={() => setShowCreate(true)}
        >
          New Portfolio
        </button>
      </div>

      {data?.data.length === 0 && (
        <p className="text-gray-500">No portfolios yet. Create one to get started.</p>
      )}

      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {data?.data.map((p) => (
          <Link
            key={p.id}
            to={`/portfolios/${p.id}`}
            className="p-4 border rounded shadow-sm hover:shadow-md transition block"
          >
            <h2 className="text-lg font-semibold">{p.name}</h2>
            <p className="text-sm text-gray-500">{p.currency}</p>
            <p className="text-xs text-gray-400 mt-2">
              Created {new Date(p.created_at).toLocaleDateString()}
            </p>
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
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-xl">
        <h2 className="text-xl font-semibold mb-4">New Portfolio</h2>
        {error && <p className="mb-3 text-red-500 text-sm">{error}</p>}
        <label className="block mb-2 text-sm font-medium">Name</label>
        <input
          className="w-full border rounded px-3 py-2 mb-4"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My Portfolio"
        />
        <label className="block mb-2 text-sm font-medium">Currency</label>
        <select
          className="w-full border rounded px-3 py-2 mb-4"
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
        >
          <option value="USD">USD</option>
          <option value="HKD">HKD</option>
          <option value="CNY">CNY</option>
        </select>
        <div className="flex justify-end gap-3">
          <button
            className="px-4 py-2 text-gray-600 rounded hover:bg-gray-100 cursor-pointer"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 cursor-pointer disabled:opacity-50"
            disabled={!name.trim()}
            onClick={() => onCreate(name.trim(), currency)}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
