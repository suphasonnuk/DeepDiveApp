"use client";

import { useState } from "react";
import { TradeSignals } from "./components/TradeSignals";

export default function TradesPage() {
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  async function handleSync() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/transactions/sync", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        setSyncResult(data.error || "Sync failed");
      } else {
        setSyncResult(
          `Synced ${data.walletsProcessed} wallet${data.walletsProcessed !== 1 ? "s" : ""}, found ${data.swapsDetected} new swap${data.swapsDetected !== 1 ? "s" : ""}`,
        );
        setRefreshKey((k) => k + 1);
      }
    } catch {
      setSyncResult("Network error — check your connection");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Trades</h1>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium transition-colors hover:border-accent/50 disabled:opacity-50"
        >
          {syncing ? "Syncing..." : "Sync Now"}
        </button>
      </div>

      {syncResult && (
        <div
          className={`rounded-lg px-3 py-2 text-xs ${
            syncResult.startsWith("Synced")
              ? "border border-success/30 bg-success/10 text-success"
              : "border border-danger/30 bg-danger/10 text-danger"
          }`}
        >
          {syncResult}
        </div>
      )}

      <TradeSignals key={refreshKey} />
    </div>
  );
}
