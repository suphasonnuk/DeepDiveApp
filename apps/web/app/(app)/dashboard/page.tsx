"use client";

import { useState, useEffect, useCallback } from "react";
import { useAccount } from "wagmi";

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
  if (value < 0.001) return "< 0.001";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
  if (value >= 1) return value.toFixed(4);
  return value.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
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
    <div className="space-y-8">
      {/* Page heading + refresh */}
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold tracking-tight">Portfolio</h1>
        {isConnected && (
          <button
            onClick={fetchPortfolio}
            disabled={loading}
            className="rounded-lg border border-border px-3 py-1.5 text-xs text-text-secondary transition-colors hover:border-accent/40 disabled:opacity-40"
          >
            {loading ? "Refreshing…" : "Refresh"}
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

      {/* Total value — raw number, no card wrapper */}
      {isConnected && (
        <div>
          <p className="text-xs uppercase tracking-widest text-text-muted">Total Portfolio Value</p>
          {loading && !portfolio ? (
            <div className="mt-2 h-12 w-48 animate-pulse rounded bg-surface-elevated" />
          ) : (
            <p className="font-display mt-2 text-5xl font-bold tracking-tight">
              {portfolio ? fmt(portfolio.totalValueUsd) : "--"}
            </p>
          )}
          {portfolio && (
            <p className="mt-1.5 text-xs text-text-muted">
              {portfolio.chain} · {portfolio.address.slice(0, 6)}…{portfolio.address.slice(-4)}
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

      {/* Token holdings — one container, divider rows */}
      {isConnected && allTokens.length > 0 && (
        <div>
          <p className="mb-3 text-xs uppercase tracking-widest text-text-muted">Holdings</p>
          <div className="overflow-hidden rounded-xl border border-border bg-surface">
            {allTokens.map((token, i) => (
              <div
                key={token.address}
                className={`flex items-center justify-between px-4 py-3.5 ${
                  i > 0 ? "border-t border-border" : ""
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-elevated text-sm font-bold">
                    {token.logoUrl
                      ? <img src={token.logoUrl} alt={token.symbol} className="h-full w-full object-cover" />
                      : token.symbol?.slice(0, 2)}
                  </div>
                  <div>
                    <p className="font-medium">{token.symbol}</p>
                    <p className="text-xs text-text-muted">
                      {fmtBalance(token.balance)} {token.symbol}
                    </p>
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
        </div>
      )}

      {/* LP positions — same list treatment */}
      {isConnected && portfolio && portfolio.lpPositions.length > 0 && (
        <div>
          <p className="mb-3 text-xs uppercase tracking-widest text-text-muted">LP Positions</p>
          <div className="overflow-hidden rounded-xl border border-border bg-surface">
            {portfolio.lpPositions.map((lp, i) => (
              <div
                key={lp.address}
                className={`flex items-center justify-between px-4 py-3.5 ${
                  i > 0 ? "border-t border-border" : ""
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/10 text-xs font-bold text-accent">
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
        </div>
      )}

      {/* Empty state */}
      {isConnected && !loading && portfolio && allTokens.length === 0 && (
        <div className="rounded-xl border border-border bg-surface p-6 text-center">
          <p className="text-text-muted">No token balances found on this chain.</p>
          <p className="mt-1 text-xs text-text-muted">
            Switch networks or check your connection.
          </p>
        </div>
      )}
    </div>
  );
}
