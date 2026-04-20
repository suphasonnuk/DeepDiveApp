"use client";

import { useState, useEffect } from "react";
import { useAccount } from "wagmi";

interface QuantSignal {
  id: number;
  symbol: string;
  signal: string;
  confidence: number;
  combinedScore: number | null;
  regime: string;
  priceAtSignal: number;
  targetPrice: number | null;
  stopPrice: number | null;
  targetPct: number | null;
  stopPct: number | null;
  riskRewardRatio: number | null;
  kellyFraction: number | null;
  delta: number | null;
  kalmanReason: string | null;
  ouZScore: number | null;
  ouHalfLifeDays: number | null;
  generatedAt: string;
}

interface PortfolioToken {
  symbol: string;
}

const SIGNAL_STYLE: Record<string, { label: string; bg: string; text: string; border: string }> = {
  BUY:  { label: "BUY",  bg: "bg-success/15",  text: "text-success",  border: "border-success/30" },
  SELL: { label: "SELL", bg: "bg-danger/15",   text: "text-danger",   border: "border-danger/30" },
  HOLD: { label: "HOLD", bg: "bg-warning/10",  text: "text-warning",  border: "border-warning/20" },
};

const REGIME_COLOR: Record<string, string> = {
  BULL:     "text-success",
  BEAR:     "text-danger",
  SIDEWAYS: "text-warning",
};

function fmt(v: number | null, prefix = "$"): string {
  if (v == null) return "--";
  if (v >= 1000) return `${prefix}${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  return `${prefix}${v.toPrecision(5)}`;
}

function pct(v: number | null, negate = false): string {
  if (v == null) return "--";
  const val = negate ? -v : v;
  return `${val > 0 ? "+" : ""}${val.toFixed(2)}%`;
}

export default function SignalsPage() {
  const { address, chain } = useAccount();
  const [signals, setSignals] = useState<QuantSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [paperTradeStatus, setPaperTradeStatus] = useState<Record<number, "idle" | "opening" | "done">>({});

  useEffect(() => {
    fetch("/api/signals?active=true&limit=30")
      .then((r) => r.json())
      .then((d) => setSignals(d.signals ?? []))
      .catch(() => setSignals([]))
      .finally(() => setLoading(false));
  }, []);

  async function scanPortfolio() {
    if (!address || !chain) return;
    setScanning(true);
    try {
      const portRes = await fetch(`/api/portfolio?address=${address}&chainId=${chain.id}`);
      if (!portRes.ok) throw new Error("portfolio unavailable");
      const port = await portRes.json();

      const STABLES = new Set(["USDC", "USDT", "DAI", "BUSD", "FRAX"]);
      const tokens: PortfolioToken[] = [port.nativeToken, ...(port.tokens ?? [])]
        .filter((t: PortfolioToken) => t?.symbol && !STABLES.has(t.symbol));

      if (!tokens.length) return;

      const sigRes = await fetch("/api/signals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokens }),
      });
      if (!sigRes.ok) throw new Error("signal generation failed");
      const sigData = await sigRes.json();

      setSignals((prev) => {
        const newIds = new Set<number>((sigData.signals ?? []).map((s: QuantSignal) => s.id));
        return [...(sigData.signals ?? []), ...prev.filter((s) => !newIds.has(s.id))];
      });
    } finally {
      setScanning(false);
    }
  }

  async function openPaperTrade(signal: QuantSignal) {
    setPaperTradeStatus((s) => ({ ...s, [signal.id]: "opening" }));
    await fetch("/api/performance/trades", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        signalId: signal.id,
        symbol: signal.symbol,
        signal: signal.signal,
        entryPrice: signal.priceAtSignal,
        positionSizeFraction: signal.kellyFraction ?? 0.05,
        targetPrice: signal.targetPrice ?? signal.priceAtSignal,
        stopPrice: signal.stopPrice ?? signal.priceAtSignal,
        confidence: signal.confidence,
        regime: signal.regime,
      }),
    });
    setPaperTradeStatus((s) => ({ ...s, [signal.id]: "done" }));
  }

  const buySignals = signals.filter((s) => s.signal === "BUY");
  const sellSignals = signals.filter((s) => s.signal === "SELL");
  const holdSignals = signals.filter((s) => s.signal === "HOLD");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Signals</h1>
        <button
          onClick={scanPortfolio}
          disabled={scanning || !address}
          title={!address ? "Connect wallet first" : undefined}
          className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
        >
          {scanning ? "Scanning..." : "Scan Portfolio"}
        </button>
      </div>

      {!address && (
        <p className="text-sm text-text-muted">Connect wallet to scan your portfolio for signals.</p>
      )}

      {/* Summary counts */}
      {signals.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "BUY",  count: buySignals.length,  color: "text-success" },
            { label: "SELL", count: sellSignals.length, color: "text-danger" },
            { label: "HOLD", count: holdSignals.length, color: "text-warning" },
          ].map(({ label, count, color }) => (
            <div key={label} className="rounded-lg border border-border bg-surface p-3 text-center">
              <p className={`text-lg font-bold ${color}`}>{count}</p>
              <p className="text-xs text-text-muted">{label}</p>
            </div>
          ))}
        </div>
      )}

      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-surface" />
          ))}
        </div>
      )}

      {!loading && signals.length === 0 && (
        <div className="rounded-xl border border-border bg-surface p-8 text-center">
          <p className="font-medium text-text-secondary">No signals yet</p>
          <p className="mt-1 text-sm text-text-muted">
            Connect your wallet and tap &quot;Scan Portfolio&quot; to generate quant signals.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {signals.map((signal) => {
          const style = SIGNAL_STYLE[signal.signal] ?? SIGNAL_STYLE.HOLD;
          const isOpen = expanded === signal.id;
          const conf = Math.round(signal.confidence * 100);
          const tradeStatus = paperTradeStatus[signal.id] ?? "idle";

          return (
            <div key={signal.id} className={`rounded-xl border bg-surface ${style.border}`}>
              <button
                className="flex w-full items-center justify-between p-4 text-left"
                onClick={() => setExpanded(isOpen ? null : signal.id)}
              >
                <div className="flex items-center gap-3">
                  <span className={`rounded-lg px-2.5 py-1 text-sm font-bold ${style.bg} ${style.text}`}>
                    {style.label}
                  </span>
                  <div>
                    <p className="font-semibold">{signal.symbol}</p>
                    <p className="text-xs text-text-muted">
                      <span className={REGIME_COLOR[signal.regime] ?? "text-text-muted"}>
                        {signal.regime}
                      </span>
                      {" · "}{conf}% conf
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium">{fmt(signal.priceAtSignal)}</p>
                  {signal.kellyFraction != null && (
                    <p className="text-xs text-text-muted">
                      Kelly {(signal.kellyFraction * 100).toFixed(1)}%
                    </p>
                  )}
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-border px-4 pb-4 pt-3 space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-lg bg-surface-elevated p-3">
                      <p className="text-xs text-text-muted">Target</p>
                      <p className="font-semibold text-success">{fmt(signal.targetPrice)}</p>
                      <p className="text-xs text-success">{pct(signal.targetPct)}</p>
                    </div>
                    <div className="rounded-lg bg-surface-elevated p-3">
                      <p className="text-xs text-text-muted">Stop</p>
                      <p className="font-semibold text-danger">{fmt(signal.stopPrice)}</p>
                      <p className="text-xs text-danger">{pct(signal.stopPct, true)}</p>
                    </div>
                  </div>

                  <div className="flex gap-4 text-xs text-text-muted">
                    <span>
                      <span className="font-medium text-text-secondary">R/R: </span>
                      {signal.riskRewardRatio?.toFixed(2) ?? "--"}
                    </span>
                    <span>
                      <span className="font-medium text-text-secondary">Δ: </span>
                      {signal.delta != null ? (signal.delta >= 0 ? `+${signal.delta}` : signal.delta) : "--"}
                    </span>
                    {signal.ouZScore != null && (
                      <span>
                        <span className="font-medium text-text-secondary">z: </span>
                        {signal.ouZScore.toFixed(2)}
                      </span>
                    )}
                    {signal.ouHalfLifeDays != null && (
                      <span>HL {signal.ouHalfLifeDays.toFixed(0)}d</span>
                    )}
                  </div>

                  {signal.kalmanReason && (
                    <p className="text-xs italic text-text-muted">{signal.kalmanReason}</p>
                  )}

                  {signal.signal !== "HOLD" && (
                    <button
                      disabled={tradeStatus !== "idle"}
                      onClick={() => openPaperTrade(signal)}
                      className="w-full rounded-lg bg-accent/10 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent/20 disabled:opacity-50"
                    >
                      {tradeStatus === "opening" ? "Opening..." : tradeStatus === "done" ? "Trade Opened ✓" : "Open Paper Trade"}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
