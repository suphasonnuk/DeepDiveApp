"use client";

import { useState, useEffect } from "react";
import { useAccount } from "wagmi";

interface WalletTransaction {
  id: number;
  txHash: string;
  chainId: number;
  blockNumber: number;
  timestamp: string;
  dexProtocol: string | null;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  gasUsed: string | null;
  gasPriceGwei: string | null;
  wasCopied: boolean;
  wallet: {
    id: number;
    address: string;
    label: string | null;
  } | null;
}

const CHAIN_NAMES: Record<number, string> = {
  1: "ETH",
  42161: "ARB",
  8453: "Base",
  137: "Polygon",
};

export function TradeSignals() {
  const { address: userAddress, isConnected } = useAccount();
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "uncopied">("uncopied");

  useEffect(() => {
    fetchTransactions();
  }, [filter]);

  async function fetchTransactions() {
    setLoading(true);
    setError(null);
    try {
      const url = `/api/transactions?limit=50&onlyUncopied=${filter === "uncopied"}`;
      const res = await fetch(url);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to load trades");
      }
      const data = await res.json();
      setTransactions(data.transactions || []);
    } catch (err: any) {
      console.error("Failed to fetch transactions:", err);
      setError(err.message || "Failed to load trades");
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleCopyTrade(tx: WalletTransaction) {
    if (!isConnected || !userAddress) {
      alert("Please connect your wallet first");
      return;
    }

    // TODO: Implement swap execution
    // 1. Get swap quote from /api/swap/quote
    // 2. Show preview modal with slippage, gas estimates
    // 3. User approves
    // 4. Sign transaction with wagmi
    // 5. Submit to chain
    // 6. Mark as copied in database

    alert("Swap execution coming soon!");
  }

  function formatAmount(amount: string, decimals: number = 18): string {
    const val = parseFloat(amount) / Math.pow(10, decimals);
    if (val >= 1000000) return `${(val / 1000000).toFixed(2)}M`;
    if (val >= 1000) return `${(val / 1000).toFixed(2)}K`;
    return val.toFixed(4);
  }

  function formatTimestamp(timestamp: string): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return `${Math.floor(diffMins / 1440)}d ago`;
  }

  if (loading) {
    return (
      <div className="text-center text-text-muted py-8">
        Loading trade signals...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-danger/30 bg-danger/5 p-6 text-center">
        <p className="text-sm font-medium text-danger">
          Could not load trades
        </p>
        <p className="mt-1 text-xs text-text-muted">{error}</p>
        <button
          onClick={fetchTransactions}
          className="mt-3 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setFilter("uncopied")}
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            filter === "uncopied"
              ? "bg-accent text-white"
              : "border border-border bg-surface text-text-secondary hover:border-accent/50"
          }`}
        >
          New Signals
        </button>
        <button
          onClick={() => setFilter("all")}
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            filter === "all"
              ? "bg-accent text-white"
              : "border border-border bg-surface text-text-secondary hover:border-accent/50"
          }`}
        >
          All Trades
        </button>
      </div>

      {/* Signals List */}
      {transactions.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-8 text-center">
          <p className="text-sm text-text-muted">
            {filter === "uncopied"
              ? "No new signals detected"
              : "No trades found"}
          </p>
          <p className="mt-1 text-xs text-text-muted">
            {filter === "uncopied"
              ? "Add wallets to track in Settings"
              : "Tracked wallets have no recorded trades yet"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {transactions.map((tx) => (
            <div
              key={tx.id}
              className="rounded-xl border border-border bg-surface p-4"
            >
              {/* Header */}
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-success/20 px-2 py-0.5 text-xs font-medium text-success">
                      {tx.dexProtocol || "DEX"}
                    </span>
                    <span className="rounded bg-surface-elevated px-2 py-0.5 text-xs text-text-muted">
                      {CHAIN_NAMES[tx.chainId]}
                    </span>
                    <span className="text-xs text-text-muted">
                      {formatTimestamp(tx.timestamp)}
                    </span>
                  </div>
                  {tx.wallet?.label && (
                    <p className="mt-1 text-xs text-text-secondary">
                      {tx.wallet.label}
                    </p>
                  )}
                </div>
                {tx.wasCopied && (
                  <span className="rounded bg-accent/20 px-2 py-1 text-xs text-accent">
                    Copied
                  </span>
                )}
              </div>

              {/* Trade Details */}
              <div className="mt-3 flex items-center justify-between">
                <div>
                  <p className="text-xs text-text-muted">Swap</p>
                  <p className="mt-1 font-mono text-sm font-medium">
                    {formatAmount(tx.amountIn)} →{" "}
                    {formatAmount(tx.amountOut)}
                  </p>
                  <p className="mt-0.5 text-xs text-text-muted">
                    {tx.tokenIn.slice(0, 6)}...{tx.tokenIn.slice(-4)} →{" "}
                    {tx.tokenOut.slice(0, 6)}...{tx.tokenOut.slice(-4)}
                  </p>
                </div>

                {!tx.wasCopied && (
                  <button
                    onClick={() => handleCopyTrade(tx)}
                    disabled={!isConnected}
                    className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
                  >
                    Copy Trade
                  </button>
                )}
              </div>

              {/* Transaction Link */}
              <div className="mt-3 pt-3 border-t border-border">
                <a
                  href={`https://etherscan.io/tx/${tx.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-accent hover:underline"
                >
                  View on Explorer →
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
