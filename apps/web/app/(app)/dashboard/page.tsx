"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
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

  const totalValue = portfolio?.totalValueUsd ?? 0;

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-elevated">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted" aria-hidden="true">
            <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
            <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
            <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
          </svg>
        </div>
        <div>
          <p className="font-medium text-text-secondary">No wallet connected</p>
          <p className="mt-1 text-sm text-text-muted">Tap "Connect Wallet" in the top-right to view your portfolio</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-10">

      {/* ── Hero: Total Portfolio Value ─────────────────────── */}
      <div className="pt-2">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] uppercase tracking-[0.15em] text-text-muted mb-2.5">
              Portfolio Value
            </p>

            {loading && !portfolio ? (
              <div className="h-14 w-48 animate-pulse rounded bg-surface-elevated" />
            ) : (
              <p className="font-display text-[3.5rem] font-bold tracking-tight leading-none">
                {portfolio ? fmt(portfolio.totalValueUsd) : "--"}
              </p>
            )}

            {portfolio && (
              <p className="mt-2.5 font-mono text-[11px] text-text-muted">
                <span className="text-text-secondary">{portfolio.chain}</span>
                <span className="mx-1.5 text-border">·</span>
                {portfolio.address.slice(0, 6)}…{portfolio.address.slice(-4)}
                {portfolio.note && (
                  <span className="ml-2 text-warning">{portfolio.note}</span>
                )}
              </p>
            )}

            {error && (
              <p className="mt-2 font-mono text-xs text-danger">Error: {error}</p>
            )}
          </div>

          {/* -m* offsets absorb padding so it doesn't affect layout spacing */}
          <button
            onClick={fetchPortfolio}
            disabled={loading}
            aria-label="Refresh portfolio"
            className="-mr-2 -mt-1 flex min-h-[44px] min-w-[44px] items-center justify-center font-mono text-[11px] uppercase tracking-[0.12em] text-text-muted transition-colors hover:text-text-secondary disabled:opacity-30"
          >
            {loading ? "···" : "↻ Refresh"}
          </button>
        </div>
      </div>

      {/* ── Holdings ────────────────────────────────────────── */}
      {allTokens.length > 0 && (
        <div>
          {/* Section header */}
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] uppercase tracking-[0.15em] text-text-muted">Holdings</p>
            <p className="font-mono text-[11px] text-text-muted">{allTokens.length} assets</p>
          </div>

          {/* Column headers */}
          <div className="grid grid-cols-[1fr_5rem_6rem] gap-x-3 pb-2 border-b border-border">
            <p className="text-[10px] uppercase tracking-[0.12em] text-text-muted">Asset</p>
            <p className="text-[10px] uppercase tracking-[0.12em] text-text-muted text-right">Price</p>
            <p className="text-[10px] uppercase tracking-[0.12em] text-text-muted text-right">Value</p>
          </div>

          {/* Token rows */}
          <div>
            {allTokens.map((token) => {
              const alloc =
                totalValue > 0 && token.valueUsd != null
                  ? token.valueUsd / totalValue
                  : 0;

              return (
                <div
                  key={token.address}
                  className="relative grid grid-cols-[1fr_5rem_6rem] gap-x-3 py-3.5 border-b border-border/50 last:border-b-0"
                >
                  {/* Allocation tint — implicit bar chart */}
                  <div
                    className="pointer-events-none absolute inset-y-0 left-0 bg-accent/[0.05]"
                    style={{ width: `${alloc * 100}%` }}
                    aria-hidden="true"
                  />

                  {/* Token identity */}
                  <div className="relative flex items-center gap-2.5">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-elevated text-[10px] font-bold">
                      {token.logoUrl ? (
                        <Image
                          src={token.logoUrl}
                          alt={token.symbol}
                          width={28}
                          height={28}
                          className="h-full w-full object-cover"
                          unoptimized
                        />
                      ) : (
                        token.symbol?.slice(0, 2)
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-semibold leading-tight">{token.symbol}</p>
                      <p className="font-mono text-[11px] text-text-muted leading-tight">
                        {fmtBalance(token.balance)}
                      </p>
                    </div>
                  </div>

                  {/* Price */}
                  <div className="relative flex items-center justify-end">
                    {token.priceUsd != null && (
                      <p className="font-mono text-xs text-text-secondary">
                        {fmt(token.priceUsd, 4)}
                      </p>
                    )}
                  </div>

                  {/* Value + allocation % */}
                  <div className="relative text-right">
                    <p className="font-mono text-sm font-semibold">{fmt(token.valueUsd)}</p>
                    {alloc > 0 && (
                      <p className="font-mono text-[11px] text-text-muted">
                        {(alloc * 100).toFixed(1)}%
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── LP Positions ─────────────────────────────────────── */}
      {portfolio && portfolio.lpPositions.length > 0 && (
        <div>
          <p className="text-[11px] uppercase tracking-[0.15em] text-text-muted mb-3">
            LP Positions
          </p>

          <div className="grid grid-cols-[1fr_5rem_6rem] gap-x-3 pb-2 border-b border-border">
            <p className="text-[10px] uppercase tracking-[0.12em] text-text-muted">Position</p>
            <p className="text-[10px] uppercase tracking-[0.12em] text-text-muted text-right">Shares</p>
            <p className="text-[10px] uppercase tracking-[0.12em] text-text-muted text-right">Value</p>
          </div>

          <div>
            {portfolio.lpPositions.map((lp, i) => (
              <div
                key={lp.address}
                className={`grid grid-cols-[1fr_5rem_6rem] gap-x-3 py-3.5 ${
                  i > 0 ? "border-t border-border/50" : ""
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/10 text-[10px] font-bold text-accent">
                    LP
                  </div>
                  <p className="text-sm font-semibold">{lp.symbol || "LP Token"}</p>
                </div>
                <div className="flex items-center justify-end">
                  <p className="font-mono text-xs text-text-secondary">
                    {fmtBalance(lp.balance)}
                  </p>
                </div>
                <div className="flex items-center justify-end">
                  <p className="font-mono text-sm font-semibold">{fmt(lp.valueUsd)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Empty state ──────────────────────────────────────── */}
      {!loading && portfolio && allTokens.length === 0 && (
        <div className="py-12 text-center">
          <p className="text-sm text-text-muted">No token balances on this chain.</p>
          <p className="mt-1 text-xs text-text-muted">Switch networks or check your connection.</p>
        </div>
      )}
    </div>
  );
}
