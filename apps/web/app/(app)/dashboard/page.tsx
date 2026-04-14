"use client";

import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import Link from "next/link";

interface DashboardData {
  trackedWallets: number;
  newSignals: number;
  totalTrades: number;
  dbConnected: boolean;
}

export default function DashboardPage() {
  const { isConnected, chain } = useAccount();
  const [data, setData] = useState<DashboardData>({
    trackedWallets: 0,
    newSignals: 0,
    totalTrades: 0,
    dbConnected: false,
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
      ]);

      const wallets =
        results[0].status === "fulfilled" ? results[0].value : null;
      const signals =
        results[1].status === "fulfilled" ? results[1].value : null;
      const trades =
        results[2].status === "fulfilled" ? results[2].value : null;

      setData({
        trackedWallets: wallets?.wallets?.length ?? 0,
        newSignals: signals?.transactions?.length ?? 0,
        totalTrades: trades?.transactions?.length ?? 0,
        dbConnected: wallets !== null && !wallets?.error,
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
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-border bg-surface p-3 text-center">
          <p className="text-xs text-text-muted">Tracked Wallets</p>
          <p className="mt-1 text-lg font-semibold">
            {loading ? "--" : data.trackedWallets}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3 text-center">
          <p className="text-xs text-text-muted">New Signals</p>
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
