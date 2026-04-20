"use client";

import { useState, useEffect, useCallback } from "react";
import { useAccount } from "wagmi";
import Link from "next/link";

interface TokenHolding {
  symbol: string;
  name: string;
  address: string;
  balance: number;
  priceUsd: number | null;
  valueUsd: number | null;
  logoUrl?: string;
  isNative?: boolean;
}

interface LpPosition {
  symbol: string;
  name: string;
  address: string;
  balance: number;
  valueUsd: number | null;
}

interface PortfolioData {
  address: string;
  chainId: number;
  chain: string;
  totalValueUsd: number;
  nativeToken: TokenHolding;
  tokens: TokenHolding[];
  lpPositions: LpPosition[];
  dataSource: string;
  note?: string;
}

function fmt(value: number | null | undefined, digits = 2): string {
  if (value == null) return "--";
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
  return `$${value.toFixed(digits)}`;
}

function fmtBalance(value: number): string {
  if (value < 0.0001) return "<0.0001";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
  return value.toPrecision(4);
}

export default function DashboardPage() {
  const { address, isConnected, chain } = useAccount();
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPortfolio = useCallback(async () => {
    if (!address || !chain) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/portfolio?address=${address}&chainId=${chain.id}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setPortfolio(await res.json());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [address, chain]);

  useEffect(() => {
    fetchPortfolio();
  }, [fetchPortfolio]);

  const allTokens = portfolio
    ? [portfolio.nativeToken, ...portfolio.tokens].filter((t) => (t.balance ?? 0) > 0)
    : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Portfolio</h1>
        {isConnected && (
          <button
            onClick={fetchPortfolio}
            disabled={loading}
            className="rounded-lg border border-border px-3 py-1.5 text-xs text-text-secondary transition-colors hover:border-accent/40 disabled:opacity-40"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        )}
      </div>

      {/* Wallet connection gate */}
      {!isConnected && (
        <div className="rounded-xl border border-accent/30 bg-accent/5 p-6 text-center">
          <p className="font-medium">Connect your wallet</p>
          <p className="mt-1 text-sm text-text-secondary">
            Connect a wallet from the top-right to see your portfolio.
          </p>
        </div>
      )}

      {/* Total value card */}
      {isConnected && (
        <div className="rounded-xl border border-border bg-surface p-5">
          <p className="text-sm text-text-secondary">Total Portfolio Value</p>
          {loading && !portfolio ? (
            <div className="mt-2 h-8 w-40 animate-pulse rounded bg-surface-elevated" />
          ) : (
            <p className="mt-1 text-3xl font-bold">
              {portfolio ? fmt(portfolio.totalValueUsd) : "--"}
            </p>
          )}
          {portfolio && (
            <p className="mt-1 text-xs text-text-muted">
              {portfolio.chain} · {portfolio.address.slice(0, 6)}...{portfolio.address.slice(-4)}
              {portfolio.note && (
                <span className="ml-2 text-warning">{portfolio.note}</span>
              )}
            </p>
          )}
          {error && (
            <p className="mt-2 text-sm text-danger">Failed to load: {error}</p>
          )}
        </div>
      )}

      {/* Token holdings */}
      {isConnected && allTokens.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-text-secondary">Holdings</h2>
          {allTokens.map((token) => (
            <div
              key={token.address}
              className="flex items-center justify-between rounded-xl border border-border bg-surface p-4"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-elevated text-sm font-bold">
                  {token.symbol?.slice(0, 2)}
                </div>
                <div>
                  <p className="font-medium">{token.symbol}</p>
                  <p className="text-xs text-text-muted">{fmtBalance(token.balance)} {token.symbol}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-semibold">{fmt(token.valueUsd)}</p>
                {token.priceUsd != null && (
                  <p className="text-xs text-text-muted">{fmt(token.priceUsd, 4)}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* LP Positions */}
      {isConnected && portfolio && portfolio.lpPositions.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-text-secondary">LP Positions</h2>
          {portfolio.lpPositions.map((lp) => (
            <div
              key={lp.address}
              className="flex items-center justify-between rounded-xl border border-border bg-surface p-4"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/10 text-xs font-bold text-accent">
                  LP
                </div>
                <div>
                  <p className="font-medium">{lp.symbol || "LP Token"}</p>
                  <p className="text-xs text-text-muted">{fmtBalance(lp.balance)} shares</p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-semibold">{fmt(lp.valueUsd)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {isConnected && !loading && portfolio && allTokens.length === 0 && (
        <div className="rounded-xl border border-border bg-surface p-6 text-center">
          <p className="text-text-muted">No token balances found on this chain.</p>
          <p className="mt-1 text-xs text-text-muted">Switch networks or check your connection.</p>
        </div>
      )}

      {/* Quick links */}
      {isConnected && (
        <div className="grid grid-cols-2 gap-3">
          <Link
            href="/markets"
            className="flex flex-col items-center rounded-xl border border-border bg-surface p-4 text-center transition-colors hover:border-accent/40"
          >
            <p className="font-medium">Signals</p>
            <p className="mt-0.5 text-xs text-text-muted">Quant recommendations</p>
          </Link>
          <Link
            href="/trades"
            className="flex flex-col items-center rounded-xl border border-border bg-surface p-4 text-center transition-colors hover:border-accent/40"
          >
            <p className="font-medium">Performance</p>
            <p className="mt-0.5 text-xs text-text-muted">Paper trading results</p>
          </Link>
        </div>
      )}
    </div>
  );
}
