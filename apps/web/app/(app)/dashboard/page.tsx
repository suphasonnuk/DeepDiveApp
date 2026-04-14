"use client";

import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import Link from "next/link";

interface ActiveSignal {
  id: number;
  tokenAddress: string;
  chainId: number;
  signalType: string;
  recommendation: string;
  whaleCount: number;
  totalVolumeUsd: number | null;
  avgConfidence: number | null;
  detectedAt: string;
}

interface DashboardData {
  trackedWallets: number;
  newSignals: number;
  totalTrades: number;
  dbConnected: boolean;
  activeSignals: ActiveSignal[];
}

const RECOMMENDATION_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  strong_buy: { label: "STRONG BUY", color: "text-success", bg: "bg-success/20" },
  buy: { label: "BUY", color: "text-success", bg: "bg-success/15" },
  hold: { label: "HOLD", color: "text-warning", bg: "bg-warning/15" },
  sell: { label: "SELL", color: "text-danger", bg: "bg-danger/15" },
  strong_sell: { label: "STRONG SELL", color: "text-danger", bg: "bg-danger/20" },
};

const CHAIN_NAMES: Record<number, string> = {
  1: "ETH",
  42161: "ARB",
  8453: "Base",
  137: "Polygon",
};

export default function DashboardPage() {
  const { isConnected, chain } = useAccount();
  const [data, setData] = useState<DashboardData>({
    trackedWallets: 0,
    newSignals: 0,
    totalTrades: 0,
    dbConnected: false,
    activeSignals: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      const results = await Promise.allSettled([
        fetch("/api/wallets").then((r) => r.json()),
        fetch("/api/transactions?onlyUncopied=true&limit=100").then((r) =>
          r.json(),
        ),
        fetch("/api/transactions?limit=100").then((r) => r.json()),
        fetch("/api/signals/generate").then((r) => r.json()),
      ]);

      const wallets =
        results[0].status === "fulfilled" ? results[0].value : null;
      const uncopied =
        results[1].status === "fulfilled" ? results[1].value : null;
      const trades =
        results[2].status === "fulfilled" ? results[2].value : null;
      const signals =
        results[3].status === "fulfilled" ? results[3].value : null;

      setData({
        trackedWallets: wallets?.wallets?.length ?? 0,
        newSignals: uncopied?.transactions?.length ?? 0,
        totalTrades: trades?.transactions?.length ?? 0,
        dbConnected: wallets !== null && !wallets?.error,
        activeSignals: signals?.signals ?? [],
      });
      setLoading(false);
    }

    fetchStats();
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Dashboard</h1>

      {/* Connection Status */}
      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-text-secondary">Wallet</p>
            <p className="mt-1 text-lg font-semibold">
              {isConnected ? (
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-success" />
                  Connected
                  {chain && (
                    <span className="text-sm font-normal text-text-muted">
                      on {chain.name}
                    </span>
                  )}
                </span>
              ) : (
                <span className="text-text-muted">Not connected</span>
              )}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-text-secondary">Database</p>
            <p className="mt-1 text-sm">
              {loading ? (
                <span className="text-text-muted">Checking...</span>
              ) : data.dbConnected ? (
                <span className="flex items-center justify-end gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-success" />
                  Online
                </span>
              ) : (
                <span className="flex items-center justify-end gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-danger" />
                  Offline
                </span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-border bg-surface p-3 text-center">
          <p className="text-xs text-text-muted">Tracked Wallets</p>
          <p className="mt-1 text-lg font-semibold">
            {loading ? "--" : data.trackedWallets}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3 text-center">
          <p className="text-xs text-text-muted">Active Signals</p>
          <p className="mt-1 text-lg font-semibold">
            {loading ? "--" : data.activeSignals.length}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3 text-center">
          <p className="text-xs text-text-muted">Uncopied</p>
          <p className="mt-1 text-lg font-semibold">
            {loading ? "--" : data.newSignals}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3 text-center">
          <p className="text-xs text-text-muted">Total Trades</p>
          <p className="mt-1 text-lg font-semibold">
            {loading ? "--" : data.totalTrades}
          </p>
        </div>
      </div>

      {/* Active Signals — Buy/Sell Indicators */}
      {!loading && data.activeSignals.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-text-secondary">
              Active Signals
            </h2>
            <Link
              href="/trades"
              className="text-xs text-accent hover:underline"
            >
              View All
            </Link>
          </div>
          {data.activeSignals.slice(0, 3).map((signal) => {
            const rec =
              RECOMMENDATION_STYLE[signal.recommendation] ||
              RECOMMENDATION_STYLE.hold;
            const confidence = Math.round(
              (signal.avgConfidence ?? 0) * 100,
            );
            return (
              <Link
                key={signal.id}
                href="/trades"
                className="flex items-center justify-between rounded-xl border border-border bg-surface p-4 transition-colors hover:border-accent/30"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-bold ${rec.bg} ${rec.color}`}
                    >
                      {rec.label}
                    </span>
                    <span className="rounded bg-surface-elevated px-1.5 py-0.5 text-[10px] text-text-muted">
                      {CHAIN_NAMES[signal.chainId] || "?"}
                    </span>
                  </div>
                  <p className="mt-1 font-mono text-xs text-text-secondary truncate">
                    {signal.tokenAddress.slice(0, 10)}...
                    {signal.tokenAddress.slice(-6)}
                  </p>
                </div>
                <div className="text-right ml-3 shrink-0">
                  <p className="text-sm font-semibold">
                    {signal.whaleCount} whale{signal.whaleCount !== 1 ? "s" : ""}
                  </p>
                  <p className="text-xs text-text-muted">
                    {confidence}% conf
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Getting Started / Quick Actions */}
      {!loading && data.trackedWallets === 0 ? (
        <div className="rounded-xl border border-accent/30 bg-accent/5 p-5">
          <p className="font-medium">Get Started</p>
          <p className="mt-1 text-sm text-text-secondary">
            Add wallet addresses to track profitable traders and copy their
            trades.
          </p>
          <div className="mt-3 flex gap-2">
            <Link
              href="/settings"
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
            >
              Add Wallets
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <Link
            href="/trades"
            className="flex items-center justify-between rounded-xl border border-border bg-surface p-4 transition-colors hover:border-accent/30"
          >
            <div>
              <p className="font-medium">Trade Signals</p>
              <p className="mt-0.5 text-sm text-text-secondary">
                {data.newSignals > 0
                  ? `${data.newSignals} new signal${data.newSignals !== 1 ? "s" : ""} to review`
                  : "No new signals"}
              </p>
            </div>
            <span className="text-text-muted">&rarr;</span>
          </Link>

          <Link
            href="/markets"
            className="flex items-center justify-between rounded-xl border border-border bg-surface p-4 transition-colors hover:border-accent/30"
          >
            <div>
              <p className="font-medium">Tracked Wallets</p>
              <p className="mt-0.5 text-sm text-text-secondary">
                {data.trackedWallets} wallet
                {data.trackedWallets !== 1 ? "s" : ""} being monitored
              </p>
            </div>
            <span className="text-text-muted">&rarr;</span>
          </Link>

          <div className="rounded-xl border border-border bg-surface p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Supported Chains</p>
                <p className="mt-0.5 text-sm text-text-secondary">
                  ETH &middot; Arbitrum &middot; Base &middot; Polygon
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
