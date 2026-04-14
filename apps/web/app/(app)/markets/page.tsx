"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";

interface TrackedWallet {
  id: number;
  address: string;
  chainId: number;
  label: string | null;
  walletType: string | null;
  isActive: boolean;
  copyEnabled: boolean;
  portfolioValueUsd: number | null;
  tradesLast30Days: number | null;
  lastSyncedAt: string | null;
}

const CHAIN_NAMES: Record<number, string> = {
  1: "ETH",
  42161: "ARB",
  8453: "Base",
  137: "Polygon",
};

const CHAIN_COLORS: Record<number, string> = {
  1: "bg-accent/20 text-accent",
  42161: "bg-success/20 text-success",
  8453: "bg-warning/20 text-warning",
  137: "bg-danger/20 text-danger",
};

function formatUsd(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
  return value.toFixed(0);
}

export default function WalletsPage() {
  const [wallets, setWallets] = useState<TrackedWallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchWallets();
  }, []);

  async function fetchWallets() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/wallets");
      if (!res.ok) throw new Error("Failed to load wallets");
      const data = await res.json();
      setWallets(data.wallets || []);
    } catch (err: any) {
      setError(err.message || "Failed to load wallets");
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    if (!search) return wallets;
    const q = search.toLowerCase();
    return wallets.filter(
      (w) =>
        w.address.toLowerCase().includes(q) ||
        w.label?.toLowerCase().includes(q) ||
        CHAIN_NAMES[w.chainId]?.toLowerCase().includes(q),
    );
  }, [wallets, search]);

  if (loading) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold">Wallets</h1>
        <div className="py-8 text-center text-sm text-text-muted">
          Loading tracked wallets...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold">Wallets</h1>
        <div className="rounded-xl border border-danger/30 bg-danger/5 p-6 text-center">
          <p className="text-sm text-danger">{error}</p>
          <button
            onClick={fetchWallets}
            className="mt-3 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Wallets</h1>
        <Link
          href="/settings"
          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
        >
          + Add
        </Link>
      </div>

      {wallets.length > 0 && (
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by address or label..."
          className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
        />
      )}

      {wallets.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-surface-elevated">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="text-text-muted"
            >
              <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
              <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
              <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
            </svg>
          </div>
          <p className="font-medium">No wallets tracked yet</p>
          <p className="mt-1 text-sm text-text-muted">
            Add wallet addresses to start monitoring smart money trades
          </p>
          <Link
            href="/settings"
            className="mt-4 inline-block rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
          >
            Add Wallets in Settings
          </Link>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-6 text-center">
          <p className="text-sm text-text-muted">
            No wallets match &quot;{search}&quot;
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((wallet) => (
            <div
              key={wallet.id}
              className="rounded-xl border border-border bg-surface p-4"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${CHAIN_COLORS[wallet.chainId] || "bg-surface-elevated text-text-muted"}`}
                    >
                      {CHAIN_NAMES[wallet.chainId] || `Chain ${wallet.chainId}`}
                    </span>
                    {wallet.copyEnabled && (
                      <span className="rounded bg-accent/20 px-2 py-0.5 text-xs text-accent">
                        Copy
                      </span>
                    )}
                    {wallet.walletType && (
                      <span className="rounded bg-success/20 px-2 py-0.5 text-xs text-success">
                        {wallet.walletType}
                      </span>
                    )}
                  </div>
                  {wallet.label && (
                    <p className="mt-1.5 text-sm font-medium">{wallet.label}</p>
                  )}
                  <p className="mt-1 font-mono text-xs text-text-secondary">
                    {wallet.address.slice(0, 10)}...{wallet.address.slice(-8)}
                  </p>
                </div>
                <div className="text-right text-xs text-text-muted ml-3 shrink-0">
                  {wallet.portfolioValueUsd != null && Number(wallet.portfolioValueUsd) > 0 && (
                    <p className="text-sm font-medium text-text-primary">
                      ${formatUsd(Number(wallet.portfolioValueUsd))}
                    </p>
                  )}
                  {wallet.tradesLast30Days != null && Number(wallet.tradesLast30Days) > 0 && (
                    <p>{wallet.tradesLast30Days} trades/30d</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
