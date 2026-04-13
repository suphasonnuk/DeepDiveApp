"use client";

import { useState, useEffect } from "react";

interface DiscoveryStats {
  totalWallets: number;
  whales: number;
  activeTraders: number;
  discovered: number;
  famous: number;
  avgPortfolio: number;
  totalPortfolio: number;
}

interface DiscoveryResult {
  success: boolean;
  chainId: number;
  discovered: number;
  imported: number;
  skipped: number;
  errors: number;
}

export function SmartMoneyDiscovery() {
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<DiscoveryStats | null>(null);
  const [lastResult, setLastResult] = useState<DiscoveryResult | null>(null);

  const loadStats = async () => {
    try {
      const response = await fetch("/api/discovery/run");
      if (!response.ok) throw new Error("Failed to load stats");
      const data = await response.json();
      setStats(data.statistics);
    } catch (error) {
      console.error("Error loading stats:", error);
    }
  };

  const runDiscovery = async (chainId: number) => {
    setLoading(true);
    try {
      const response = await fetch("/api/discovery/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chainId, minPortfolioValue: 1000000 }),
      });

      if (!response.ok) throw new Error("Discovery failed");
      const result = await response.json();
      setLastResult(result);
      await loadStats(); // Refresh stats
    } catch (error) {
      console.error("Discovery error:", error);
      alert("Discovery failed. Check console for details.");
    } finally {
      setLoading(false);
    }
  };

  const importFamousWallets = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/discovery/famous", {
        method: "POST",
      });

      if (!response.ok) throw new Error("Import failed");
      const result = await response.json();
      alert(`Imported ${result.imported} famous wallets`);
      await loadStats(); // Refresh stats
    } catch (error) {
      console.error("Import error:", error);
      alert("Import failed. Check console for details.");
    } finally {
      setLoading(false);
    }
  };

  // Load stats on mount
  useEffect(() => {
    loadStats();
  }, []);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h3 className="text-sm font-semibold">Smart Money Discovery</h3>
        <p className="mt-1 text-xs text-text-secondary">
          Automatically discover top 1-5% wallets by portfolio value who are actively trading
        </p>
      </div>

      {/* Statistics */}
      {stats && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-border bg-surface-secondary p-3">
            <p className="text-xs text-text-secondary">Total Tracked</p>
            <p className="mt-1 text-lg font-bold">{stats.totalWallets}</p>
          </div>
          <div className="rounded-lg border border-border bg-surface-secondary p-3">
            <p className="text-xs text-text-secondary">Whales</p>
            <p className="mt-1 text-lg font-bold">{stats.whales}</p>
          </div>
          <div className="rounded-lg border border-border bg-surface-secondary p-3">
            <p className="text-xs text-text-secondary">Active Traders</p>
            <p className="mt-1 text-lg font-bold">{stats.activeTraders}</p>
          </div>
          <div className="rounded-lg border border-border bg-surface-secondary p-3">
            <p className="text-xs text-text-secondary">Auto-Discovered</p>
            <p className="mt-1 text-lg font-bold">{stats.discovered}</p>
          </div>
        </div>
      )}

      {/* Last Result */}
      {lastResult && (
        <div className="rounded-lg border border-success bg-success/5 p-3">
          <p className="text-xs font-medium text-success">
            ✓ Discovery Complete
          </p>
          <p className="mt-1 text-xs text-text-secondary">
            Found {lastResult.discovered} wallets • Imported {lastResult.imported} • Skipped {lastResult.skipped}
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="space-y-2">
        <button
          onClick={importFamousWallets}
          disabled={loading}
          className="w-full rounded-lg border border-border bg-surface py-2.5 text-sm font-medium hover:bg-surface-secondary disabled:opacity-50"
        >
          {loading ? "Importing..." : "Import Famous Wallets"}
        </button>

        <div className="flex gap-2">
          <button
            onClick={() => runDiscovery(1)}
            disabled={loading}
            className="flex-1 rounded-lg border border-border bg-surface py-2.5 text-sm font-medium hover:bg-surface-secondary disabled:opacity-50"
          >
            {loading ? "..." : "Discover (ETH)"}
          </button>
          <button
            onClick={() => runDiscovery(42161)}
            disabled={loading}
            className="flex-1 rounded-lg border border-border bg-surface py-2.5 text-sm font-medium hover:bg-surface-secondary disabled:opacity-50"
          >
            {loading ? "..." : "Discover (ARB)"}
          </button>
        </div>
      </div>

      {/* Info */}
      <div className="rounded-lg border border-warning bg-warning/5 p-3">
        <p className="text-xs text-text-secondary">
          ⚠️ Discovery uses Moralis & Covalent APIs. Ensure <code className="rounded bg-surface px-1 py-0.5">MORALIS_API_KEY</code> and <code className="rounded bg-surface px-1 py-0.5">COVALENT_API_KEY</code> are set in your environment.
        </p>
      </div>
    </div>
  );
}
