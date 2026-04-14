"use client";

import { useState, useEffect } from "react";

interface SmartMoneySignal {
  id: number;
  tokenAddress: string;
  chainId: number;
  signalType: string;
  whaleCount: number;
  totalVolumeUsd: number | null;
  avgConfidence: number | null;
  recommendation: string;
  targetPriceUsd: number | null;
  stopLossUsd: number | null;
  detectedAt: string;
  windowStart: string;
  windowEnd: string;
  isActive: boolean;
  userDismissed: boolean;
}

const CHAIN_NAMES: Record<number, string> = {
  1: "ETH",
  42161: "ARB",
  8453: "Base",
  137: "Polygon",
};

const RECOMMENDATION_CONFIG: Record<
  string,
  { label: string; color: string; bg: string }
> = {
  strong_buy: {
    label: "STRONG BUY",
    color: "text-success",
    bg: "bg-success/20",
  },
  buy: { label: "BUY", color: "text-success", bg: "bg-success/15" },
  hold: {
    label: "HOLD",
    color: "text-warning",
    bg: "bg-warning/15",
  },
  sell: { label: "SELL", color: "text-danger", bg: "bg-danger/15" },
  strong_sell: {
    label: "STRONG SELL",
    color: "text-danger",
    bg: "bg-danger/20",
  },
};

const SIGNAL_TYPE_LABELS: Record<string, string> = {
  accumulation: "Whale Accumulation",
  distribution: "Whale Distribution",
  whale_buy: "Whale Buy",
  whale_sell: "Whale Sell",
};

function formatVolume(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

function formatTimeAgo(timestamp: string): string {
  const diffMs = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return `${Math.floor(mins / 1440)}d ago`;
}

function ConfidenceBar({ value }: { value: number }) {
  const percent = Math.round(value * 100);
  const color =
    percent >= 80
      ? "bg-success"
      : percent >= 60
        ? "bg-accent"
        : percent >= 40
          ? "bg-warning"
          : "bg-danger";

  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 rounded-full bg-surface-elevated">
        <div
          className={`h-full rounded-full ${color} transition-all`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="text-xs font-mono text-text-secondary">{percent}%</span>
    </div>
  );
}

export function SignalCards() {
  const [signals, setSignals] = useState<SmartMoneySignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSignals();
  }, []);

  async function fetchSignals() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/signals/generate");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to load signals");
      }
      const data = await res.json();
      setSignals(data.signals || []);
    } catch (err: any) {
      console.error("Failed to fetch signals:", err);
      setError(err.message || "Failed to load signals");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="py-4 text-center text-sm text-text-muted">
        Loading signals...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-danger/30 bg-danger/5 p-4 text-center">
        <p className="text-sm text-danger">Could not load signals</p>
        <p className="mt-1 text-xs text-text-muted">{error}</p>
        <button
          onClick={fetchSignals}
          className="mt-2 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover"
        >
          Retry
        </button>
      </div>
    );
  }

  if (signals.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface p-6 text-center">
        <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-surface-elevated">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-text-muted"
          >
            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
          </svg>
        </div>
        <p className="text-sm font-medium">No active signals</p>
        <p className="mt-1 text-xs text-text-muted">
          Signals appear when the quant engine detects whale accumulation or
          distribution patterns in tracked wallet activity
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {signals.map((signal) => {
        const rec =
          RECOMMENDATION_CONFIG[signal.recommendation] ||
          RECOMMENDATION_CONFIG.hold;
        const confidence = signal.avgConfidence ?? 0;

        return (
          <div
            key={signal.id}
            className="rounded-xl border border-border bg-surface p-4"
          >
            {/* Header row: signal type + recommendation badge */}
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`rounded px-2 py-0.5 text-xs font-bold ${rec.bg} ${rec.color}`}>
                    {rec.label}
                  </span>
                  <span className="rounded bg-surface-elevated px-2 py-0.5 text-xs text-text-muted">
                    {CHAIN_NAMES[signal.chainId] || `Chain ${signal.chainId}`}
                  </span>
                </div>
                <p className="mt-1.5 text-sm font-medium">
                  {SIGNAL_TYPE_LABELS[signal.signalType] || signal.signalType}
                </p>
              </div>
              <span className="text-xs text-text-muted">
                {formatTimeAgo(signal.detectedAt)}
              </span>
            </div>

            {/* Token address */}
            <p className="mt-1 font-mono text-xs text-text-secondary">
              {signal.tokenAddress.slice(0, 10)}...
              {signal.tokenAddress.slice(-8)}
            </p>

            {/* Metrics row */}
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-text-muted">Whales</p>
                <p className="text-sm font-semibold">{signal.whaleCount}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted">Volume</p>
                <p className="text-sm font-semibold">
                  {signal.totalVolumeUsd
                    ? formatVolume(Number(signal.totalVolumeUsd))
                    : "--"}
                </p>
              </div>
            </div>

            {/* Confidence bar */}
            <div className="mt-3">
              <p className="mb-1 text-xs text-text-muted">Confidence</p>
              <ConfidenceBar value={confidence} />
            </div>

            {/* Price targets (if available) */}
            {(signal.targetPriceUsd || signal.stopLossUsd) && (
              <div className="mt-3 flex gap-4 border-t border-border pt-3">
                {signal.targetPriceUsd && (
                  <div>
                    <p className="text-xs text-text-muted">Target</p>
                    <p className="text-sm font-medium text-success">
                      ${Number(signal.targetPriceUsd).toFixed(2)}
                    </p>
                  </div>
                )}
                {signal.stopLossUsd && (
                  <div>
                    <p className="text-xs text-text-muted">Stop Loss</p>
                    <p className="text-sm font-medium text-danger">
                      ${Number(signal.stopLossUsd).toFixed(2)}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
