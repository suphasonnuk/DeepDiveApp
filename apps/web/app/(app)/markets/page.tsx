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

const QUICK_SCAN_TOKENS = [
  { symbol: "BTC" }, { symbol: "ETH" }, { symbol: "BNB" },
  { symbol: "SOL" }, { symbol: "XRP" }, { symbol: "ADA" },
  { symbol: "DOGE" }, { symbol: "AVAX" }, { symbol: "DOT" },
  { symbol: "MATIC" }, { symbol: "LINK" }, { symbol: "UNI" },
  { symbol: "LTC" }, { symbol: "ATOM" }, { symbol: "NEAR" },
  { symbol: "ARB" }, { symbol: "OP" }, { symbol: "AAVE" },
  { symbol: "MKR" }, { symbol: "INJ" },
];

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
  const [paperTradeStatus, setPaperTradeStatus] = useState<Record<number, "idle" | "opening" | "done" | "error">>({});
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanInfo, setScanInfo] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/signals?active=true&limit=30")
      .then((r) => r.json())
      .then((d) => setSignals(d.signals ?? []))
      .catch(() => setSignals([]))
      .finally(() => setLoading(false));
  }, []);

  async function runScan(tokens: PortfolioToken[], label: string) {
    setScanning(true);
    setScanError(null);
    setScanInfo(null);
    try {
      const sigRes = await fetch("/api/signals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokens }),
      });
      if (!sigRes.ok) throw new Error("Signal generation failed — is the quant engine running?");
      const sigData = await sigRes.json();
      const count = sigData.signals?.length ?? 0;
      setScanInfo(`${label}: ${count} signal${count !== 1 ? "s" : ""} generated`);
      setSignals((prev) => {
        const newIds = new Set<number>((sigData.signals ?? []).map((s: QuantSignal) => s.id));
        return [...(sigData.signals ?? []), ...prev.filter((s) => !newIds.has(s.id))];
      });
    } catch (e) {
      setScanError((e as Error).message);
    } finally {
      setScanning(false);
    }
  }

  async function scanPortfolio() {
    if (!address || !chain) return;
    const STABLES = new Set(["USDC", "USDT", "DAI", "BUSD", "FRAX"]);
    try {
      const portRes = await fetch(`/api/portfolio?address=${address}&chainId=${chain.id}`);
      if (!portRes.ok) throw new Error("Portfolio fetch failed — check wallet connection");
      const port = await portRes.json();
      const tokens: PortfolioToken[] = [port.nativeToken, ...(port.tokens ?? [])]
        .filter((t: PortfolioToken) => t?.symbol && !STABLES.has(t.symbol));
      if (!tokens.length) {
        setScanError("No tokens found in wallet. Try Quick Scan instead.");
        return;
      }
      await runScan(tokens, "Portfolio scan");
    } catch (e) {
      setScanError((e as Error).message);
    }
  }

  async function quickScan() {
    await runScan(QUICK_SCAN_TOKENS, "Quick scan");
  }

  async function openPaperTrade(signal: QuantSignal) {
    setPaperTradeStatus((s) => ({ ...s, [signal.id]: "opening" }));
    try {
      const res = await fetch("/api/performance/trades", {
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
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setPaperTradeStatus((s) => ({ ...s, [signal.id]: "done" }));
    } catch {
      setPaperTradeStatus((s) => ({ ...s, [signal.id]: "error" }));
    }
  }

  const buySignals = signals.filter((s) => s.signal === "BUY");
  const sellSignals = signals.filter((s) => s.signal === "SELL");
  const holdSignals = signals.filter((s) => s.signal === "HOLD");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold tracking-tight">Signals</h1>
        <div className="flex gap-2">
          <button
            onClick={quickScan}
            disabled={scanning}
            className="rounded-xl border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-surface disabled:opacity-40"
          >
            {scanning ? "Scanning..." : "Quick Scan"}
          </button>
          <button
            onClick={scanPortfolio}
            disabled={scanning || !address}
            title={!address ? "Connect wallet first" : undefined}
            className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
          >
            {scanning ? "Scanning..." : "Scan Portfolio"}
          </button>
        </div>
      </div>

      {!address && (
        <p className="text-sm text-text-muted">Connect wallet to scan your portfolio, or use Quick Scan for popular tokens.</p>
      )}

      {scanError && (
        <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {scanError}
        </p>
      )}
      {scanInfo && (
        <p className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-secondary">
          {scanInfo}
        </p>
      )}

      {/* Summary bar — inline counts, not card grid */}
      {signals.length > 0 && (
        <div className="flex items-baseline gap-6 border-b border-border pb-4">
          <div className="flex items-baseline gap-1.5">
            <span className="font-display text-2xl font-bold text-success">{buySignals.length}</span>
            <span className="text-xs uppercase tracking-widest text-text-muted">Buy</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="font-display text-2xl font-bold text-danger">{sellSignals.length}</span>
            <span className="text-xs uppercase tracking-widest text-text-muted">Sell</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="font-display text-2xl font-bold text-warning">{holdSignals.length}</span>
            <span className="text-xs uppercase tracking-widest text-text-muted">Hold</span>
          </div>
          <span className="ml-auto text-xs text-text-muted">{signals.length} signals</span>
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
                    <p className="text-xs text-text-muted" title="Kelly Criterion: optimal position size as fraction of portfolio">
                      Size {(signal.kellyFraction * 100).toFixed(1)}%
                    </p>
                  )}
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-border px-4 pb-4 pt-3 space-y-3">
                  {/* Kalman filter rationale — plain English first, abbreviations second */}
                  {signal.kalmanReason && (
                    <p className="text-sm leading-relaxed text-text-secondary">
                      {signal.kalmanReason}
                    </p>
                  )}

                  {/* Risk levels from Kelly + OU price targets */}
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-lg bg-surface-elevated p-3">
                      <p className="text-xs text-text-muted">Take Profit</p>
                      <p className="font-semibold text-success">{fmt(signal.targetPrice)}</p>
                      <p className="text-xs text-success">{pct(signal.targetPct)}</p>
                    </div>
                    <div className="rounded-lg bg-surface-elevated p-3">
                      <p className="text-xs text-text-muted">Stop Loss</p>
                      <p className="font-semibold text-danger">{fmt(signal.stopPrice)}</p>
                      <p className="text-xs text-danger">{pct(signal.stopPct, true)}</p>
                    </div>
                  </div>

                  {/* Model evidence — full labels, units, threshold context */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs">
                    {signal.riskRewardRatio != null && (
                      <div>
                        <p className="text-text-muted">Risk / Reward</p>
                        <p className="font-medium text-text-secondary">{signal.riskRewardRatio.toFixed(2)}×</p>
                      </div>
                    )}
                    {signal.ouZScore != null && (
                      <div title="OU Z-Score: standard deviations from mean-reverting fair value. |z| > 1.5 triggers signal.">
                        <p className="text-text-muted">OU Z-Score</p>
                        <p className={`font-medium ${
                          signal.ouZScore < -1.5 ? "text-success"
                          : signal.ouZScore > 1.5 ? "text-danger"
                          : "text-text-secondary"
                        }`}>
                          {signal.ouZScore > 0 ? "+" : ""}{signal.ouZScore.toFixed(2)}σ
                        </p>
                      </div>
                    )}
                    {signal.ouHalfLifeDays != null && (
                      <div title="Mean-reversion half-life: expected days for price to close half the gap to fair value.">
                        <p className="text-text-muted">Mean-Rev Half-Life</p>
                        <p className="font-medium text-text-secondary">{signal.ouHalfLifeDays.toFixed(0)} days</p>
                      </div>
                    )}
                    {signal.delta != null && (
                      <div title="Net delta: directional exposure of this signal position.">
                        <p className="text-text-muted">Net Delta</p>
                        <p className="font-medium text-text-secondary">
                          {signal.delta === 0 ? "Neutral" : signal.delta > 0 ? `+${signal.delta}` : signal.delta}
                        </p>
                      </div>
                    )}
                  </div>

                  {signal.signal !== "HOLD" && (
                    <button
                      disabled={tradeStatus === "opening" || tradeStatus === "done"}
                      onClick={() => openPaperTrade(signal)}
                      className={`w-full rounded-lg py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
                        tradeStatus === "error"
                          ? "bg-danger/10 text-danger hover:bg-danger/20"
                          : "bg-accent/10 text-accent hover:bg-accent/20"
                      }`}
                    >
                      {tradeStatus === "opening"
                        ? "Opening..."
                        : tradeStatus === "done"
                          ? "Trade Opened ✓"
                          : tradeStatus === "error"
                            ? "Failed — tap to retry"
                            : "Open Paper Trade"}
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
