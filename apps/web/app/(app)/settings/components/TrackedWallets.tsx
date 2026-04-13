"use client";

import { useState, useEffect } from "react";

interface TrackedWallet {
  id: number;
  address: string;
  chainId: number;
  label: string | null;
  isActive: boolean;
  copyEnabled: boolean;
  lastSyncedAt: string | null;
}

const CHAIN_NAMES: Record<number, string> = {
  1: "Ethereum",
  42161: "Arbitrum",
  8453: "Base",
  137: "Polygon",
};

export function TrackedWallets() {
  const [wallets, setWallets] = useState<TrackedWallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({
    address: "",
    chainId: 1,
    label: "",
    copyEnabled: true,
  });

  useEffect(() => {
    fetchWallets();
  }, []);

  async function fetchWallets() {
    try {
      const res = await fetch("/api/wallets");
      const data = await res.json();
      setWallets(data.wallets || []);
    } catch (error) {
      console.error("Failed to fetch wallets:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddWallet(e: React.FormEvent) {
    e.preventDefault();

    try {
      const res = await fetch("/api/wallets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const error = await res.json();
        alert(error.error || "Failed to add wallet");
        return;
      }

      // Reset form and refresh list
      setFormData({ address: "", chainId: 1, label: "", copyEnabled: true });
      setShowAddForm(false);
      fetchWallets();
    } catch (error) {
      console.error("Failed to add wallet:", error);
      alert("Failed to add wallet");
    }
  }

  async function handleRemoveWallet(id: number) {
    if (!confirm("Remove this wallet from tracking?")) return;

    try {
      const res = await fetch(`/api/wallets?id=${id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error("Failed to remove wallet");
      }

      fetchWallets();
    } catch (error) {
      console.error("Failed to remove wallet:", error);
      alert("Failed to remove wallet");
    }
  }

  if (loading) {
    return <div className="text-center text-text-muted py-4">Loading...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-text-secondary">
          {wallets.length} wallet{wallets.length !== 1 ? "s" : ""} tracked
        </p>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
        >
          {showAddForm ? "Cancel" : "+ Add Wallet"}
        </button>
      </div>

      {/* Add Wallet Form */}
      {showAddForm && (
        <form
          onSubmit={handleAddWallet}
          className="space-y-3 rounded-xl border border-border bg-surface p-4"
        >
          <div>
            <label className="mb-1 block text-xs text-text-secondary">
              Wallet Address
            </label>
            <input
              type="text"
              value={formData.address}
              onChange={(e) =>
                setFormData({ ...formData, address: e.target.value })
              }
              placeholder="0x..."
              required
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm font-mono text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-text-secondary">
              Chain
            </label>
            <select
              value={formData.chainId}
              onChange={(e) =>
                setFormData({ ...formData, chainId: parseInt(e.target.value) })
              }
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
            >
              <option value={1}>Ethereum</option>
              <option value={42161}>Arbitrum</option>
              <option value={8453}>Base</option>
              <option value={137}>Polygon</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs text-text-secondary">
              Label (optional)
            </label>
            <input
              type="text"
              value={formData.label}
              onChange={(e) =>
                setFormData({ ...formData, label: e.target.value })
              }
              placeholder="e.g., Smart Money Wallet #1"
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-lg bg-accent py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
          >
            Add Wallet
          </button>
        </form>
      )}

      {/* Wallet List */}
      {wallets.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-8 text-center">
          <p className="text-sm text-text-muted">No wallets tracked yet</p>
          <p className="mt-1 text-xs text-text-muted">
            Add a wallet address to start copy trading
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {wallets.map((wallet) => (
            <div
              key={wallet.id}
              className="flex items-center justify-between rounded-xl border border-border bg-surface p-4"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-mono text-sm font-medium">
                    {wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}
                  </p>
                  <span className="rounded bg-surface-elevated px-2 py-0.5 text-xs text-text-muted">
                    {CHAIN_NAMES[wallet.chainId]}
                  </span>
                  {wallet.copyEnabled && (
                    <span className="rounded bg-accent/20 px-2 py-0.5 text-xs text-accent">
                      Copy Enabled
                    </span>
                  )}
                </div>
                {wallet.label && (
                  <p className="mt-1 text-xs text-text-secondary">
                    {wallet.label}
                  </p>
                )}
                {wallet.lastSyncedAt && (
                  <p className="mt-1 text-xs text-text-muted">
                    Last synced:{" "}
                    {new Date(wallet.lastSyncedAt).toLocaleString()}
                  </p>
                )}
              </div>
              <button
                onClick={() => handleRemoveWallet(wallet.id)}
                className="text-xs text-danger hover:underline"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
