"use client";

import { useState, useEffect, useMemo, memo } from "react";
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
  suggestedLeverage: number | null;
  delta: number | null;
  kalmanReason: string | null;
  ouZScore: number | null;
  ouHalfLifeDays: number | null;
  generatedAt: string;
}

interface PortfolioToken { symbol: string; }

type Filter = "ALL" | "BUY" | "SELL" | "HOLD";
type SortBy = "confidence" | "recency";
type TradeStatus = "idle" | "opening" | "done" | "error";
type BinStatus = "idle" | "opening" | "done" | "skipped" | "error";

// CoinMarketCap top 30 non-stablecoin tokens (April 2026), filtered to those
// with Binance USDT spot pairs so OHLCV-driven signals are reliable.
// Excluded (no Binance spot): HYPE, LEO, XMR, CC, M, CRO, MNT.
const QUICK_SCAN_TOKENS: PortfolioToken[] = [
  { symbol: "BTC" },  { symbol: "ETH" },  { symbol: "XRP" },
  { symbol: "BNB" },  { symbol: "SOL" },  { symbol: "TRX" },
  { symbol: "DOGE" }, { symbol: "BCH" },  { symbol: "ADA" },
  { symbol: "LINK" }, { symbol: "XLM" },  { symbol: "ZEC" },
  { symbol: "LTC" },  { symbol: "AVAX" }, { symbol: "HBAR" },
  { symbol: "SUI" },  { symbol: "SHIB" }, { symbol: "TON" },
  { symbol: "TAO" },  { symbol: "WLFI" }, { symbol: "UNI" },
  { symbol: "DOT" },  { symbol: "SKY" },
];

const SIGNAL_STYLE = {
  BUY:  { label: "BUY",  bg: "bg-success/15", text: "text-success", border: "border-success/30" },
  SELL: { label: "SELL", bg: "bg-danger/15",  text: "text-danger",  border: "border-danger/30"  },
  HOLD: { label: "HOLD", bg: "bg-warning/10", text: "text-warning", border: "border-warning/20" },
} as const;

const REGIME_COLOR: Record<string, string> = {
  BULL: "text-success",
  BEAR: "text-danger",
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

const ConfidenceBar = memo(function ConfidenceBar({ value }: { value: number }) {
  const p = Math.round(value * 100);
  const color = p >= 75 ? "bg-success" : p >= 50 ? "bg-accent" : p >= 35 ? "bg-warning" : "bg-danger";
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-1 flex-1 rounded-full bg-border"
        role="progressbar"
        aria-valuenow={p}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Signal confidence ${p}%`}
      >
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${p}%` }} />
      </div>
      <span className="w-8 text-right text-xs tabular-nums text-text-secondary">{p}%</span>
    </div>
  );
});

function TradeButtons({
  tradeStatus,
  bStatus,
  onPaper,
  onBinance,
}: {
  tradeStatus: TradeStatus;
  bStatus: BinStatus;
  onPaper: () => void;
  onBinance: () => void;
}) {
  return (
    <div className="space-y-2">
      <button
        disabled={bStatus === "opening" || bStatus === "done" || bStatus === "skipped"}
        onClick={onBinance}
        className={`w-full rounded-lg py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
          bStatus === "error"   ? "bg-danger/10 text-danger hover:bg-danger/20"
          : bStatus === "done"   ? "bg-success/10 text-success"
          : bStatus === "skipped" ? "bg-surface text-text-muted"
          : "bg-success/10 text-success hover:bg-success/20"
        }`}
      >
        {bStatus === "opening" ? "Opening on Binance..."
          : bStatus === "done"    ? "Binance Position Opened ✓"
          : bStatus === "skipped" ? "Already Open on Binance"
          : bStatus === "error"   ? "Binance Failed — tap to retry"
          : "Open on Binance Testnet"}
      </button>
      <button
        disabled={tradeStatus === "opening" || tradeStatus === "done"}
        onClick={onPaper}
        className={`w-full rounded-lg py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
          tradeStatus === "error"
            ? "bg-danger/10 text-danger hover:bg-danger/20"
            : "bg-accent/10 text-accent hover:bg-accent/20"
        }`}
      >
        {tradeStatus === "opening" ? "Opening..."
          : tradeStatus === "done"  ? "Paper Trade Opened ✓"
          : tradeStatus === "error" ? "Failed — tap to retry"
          : "Open Paper Trade"}
      </button>
    </div>
  );
}

function HeroCard({
  signal,
  portfolioBalance,
  tradeStatus,
  bStatus,
  onPaper,
  onBinance,
}: {
  signal: QuantSignal;
  portfolioBalance: number;
  tradeStatus: TradeStatus;
  bStatus: BinStatus;
  onPaper: () => void;
  onBinance: () => void;
}) {
  const style = SIGNAL_STYLE[signal.signal as keyof typeof SIGNAL_STYLE] ?? SIGNAL_STYLE.HOLD;
  const kelly = signal.kellyFraction ?? 0;
  const leverage = signal.suggestedLeverage ?? 1.0;
  const positionUsd = Math.round(portfolioBalance * kelly * 100) / 100;
  const marginUsd = leverage > 0 ? Math.round((positionUsd / leverage) * 100) / 100 : positionUsd;

  return (
    <div className="rounded-xl bg-surface-elevated p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className={`rounded-lg px-3 py-1 text-sm font-bold tracking-wide ${style.bg} ${style.text}`}>
              {style.label}
            </span>
            <span className={`text-xs font-medium ${REGIME_COLOR[signal.regime] ?? "text-text-muted"}`}>
              {signal.regime}
            </span>
          </div>
          <p className="font-display text-3xl font-bold tracking-tight">{signal.symbol}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="font-semibold">{fmt(signal.priceAtSignal)}</p>
          {kelly > 0 && (
            <p className="mt-0.5 text-xs text-text-muted">
              Kelly {(kelly * 100).toFixed(1)}% · <span className="font-medium">${positionUsd.toFixed(2)}</span>
            </p>
          )}
          {leverage > 1 && (
            <p className="text-xs text-text-muted">
              <span className="font-medium text-accent">{leverage}×</span> leverage · ${marginUsd.toFixed(2)} margin
            </p>
          )}
          {signal.riskRewardRatio != null && (
            <p className="text-xs text-text-muted">R/R {signal.riskRewardRatio.toFixed(2)}×</p>
          )}
        </div>
      </div>

      <ConfidenceBar value={signal.confidence} />

      {/* TP / SL */}
      {(signal.targetPrice || signal.stopPrice) && (
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-surface p-3">
            <p className="text-xs text-text-muted">Take Profit</p>
            <p className="font-semibold text-success">{fmt(signal.targetPrice)}</p>
            <p className="text-xs text-success">{pct(signal.targetPct)}</p>
          </div>
          <div className="rounded-lg bg-surface p-3">
            <p className="text-xs text-text-muted">Stop Loss</p>
            <p className="font-semibold text-danger">{fmt(signal.stopPrice)}</p>
            <p className="text-xs text-danger">{pct(signal.stopPct, true)}</p>
          </div>
        </div>
      )}

      {/* Kalman rationale */}
      {signal.kalmanReason && (
        <p className="line-clamp-2 text-sm leading-relaxed text-text-secondary">
          {signal.kalmanReason}
        </p>
      )}

      {signal.signal !== "HOLD" && (
        <TradeButtons

          tradeStatus={tradeStatus}
          bStatus={bStatus}
          onPaper={onPaper}
          onBinance={onBinance}
        />
      )}
    </div>
  );
}

const SignalCard = memo(function SignalCard({
  signal,
  portfolioBalance,
  isExpanded,
  onToggle,
  tradeStatus,
  bStatus,
  onPaper,
  onBinance,
}: {
  signal: QuantSignal;
  portfolioBalance: number;
  isExpanded: boolean;
  onToggle: () => void;
  tradeStatus: TradeStatus;
  bStatus: BinStatus;
  onPaper: () => void;
  onBinance: () => void;
}) {
  const style = SIGNAL_STYLE[signal.signal as keyof typeof SIGNAL_STYLE] ?? SIGNAL_STYLE.HOLD;
  const kelly = signal.kellyFraction ?? 0;
  const leverage = signal.suggestedLeverage ?? 1.0;
  const positionUsd = Math.round(portfolioBalance * kelly * 100) / 100;

  return (
    <div className={`rounded-xl border bg-surface ${style.border}`}>
      {/* Always-visible: badge + symbol + regime + price */}
      <div className="p-4 space-y-2.5">
        <button
          className="flex w-full items-center justify-between text-left"
          aria-expanded={isExpanded}
          aria-controls={`signal-detail-${signal.id}`}
          onClick={onToggle}
        >
          <div className="flex items-center gap-2.5">
            <span className={`rounded-md px-2.5 py-1 text-xs font-bold ${style.bg} ${style.text}`}>
              {style.label}
            </span>
            <span className="font-semibold">{signal.symbol}</span>
            <span className={`text-xs ${REGIME_COLOR[signal.regime] ?? "text-text-muted"}`}>
              {signal.regime}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2 ml-2">
            <span className="text-sm font-medium">{fmt(signal.priceAtSignal)}</span>
            <svg
              width="12" height="12" viewBox="0 0 12 12" fill="none"
              className={`text-text-muted transition-transform ${isExpanded ? "rotate-180" : ""}`}
            >
              <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </button>

        {/* Confidence — always visible */}
        <ConfidenceBar value={signal.confidence} />

        {/* TP / SL inline — always visible */}
        {(signal.targetPrice || signal.stopPrice) && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            {signal.targetPrice != null && (
              <span className="text-text-muted">
                TP{" "}
                <span className="font-medium text-success">{fmt(signal.targetPrice)}</span>
                {signal.targetPct != null && (
                  <span className="text-success"> {pct(signal.targetPct)}</span>
                )}
              </span>
            )}
            {signal.stopPrice != null && (
              <span className="text-text-muted">
                SL{" "}
                <span className="font-medium text-danger">{fmt(signal.stopPrice)}</span>
                {signal.stopPct != null && (
                  <span className="text-danger"> {pct(signal.stopPct, true)}</span>
                )}
              </span>
            )}
            {kelly > 0 && (
              <span className="ml-auto text-text-muted">
                Kelly {(kelly * 100).toFixed(1)}%
                {" · "}
                <span className="font-medium">${positionUsd.toFixed(2)}</span>
                {leverage > 1 && (
                  <span className="text-accent"> {leverage}×</span>
                )}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Expanded: full model stats + actions */}
      {isExpanded && (
        <div
          id={`signal-detail-${signal.id}`}
          className="border-t border-border px-4 pb-4 pt-3 space-y-3"
        >
          {signal.kalmanReason && (
            <p className="text-sm leading-relaxed text-text-secondary">{signal.kalmanReason}</p>
          )}

          <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs">
            {signal.riskRewardRatio != null && (
              <div>
                <p className="text-text-muted">Risk / Reward</p>
                <p className="font-medium text-text-secondary">{signal.riskRewardRatio.toFixed(2)}×</p>
              </div>
            )}
            {signal.ouZScore != null && (
              <div>
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
              <div>
                <p className="text-text-muted">Mean-Rev Half-Life</p>
                <p className="font-medium text-text-secondary">{signal.ouHalfLifeDays.toFixed(0)} days</p>
              </div>
            )}
            {signal.delta != null && (
              <div>
                <p className="text-text-muted">Net Delta</p>
                <p className="font-medium text-text-secondary">
                  {signal.delta === 0 ? "Neutral" : signal.delta > 0 ? `+${signal.delta}` : signal.delta}
                </p>
              </div>
            )}
          </div>

          {signal.signal !== "HOLD" && (
            <TradeButtons
    
              tradeStatus={tradeStatus}
              bStatus={bStatus}
              onPaper={onPaper}
              onBinance={onBinance}
            />
          )}
        </div>
      )}
    </div>
  );
});

export default function SignalsPage() {
  const { address, chain } = useAccount();
  const [signals, setSignals] = useState<QuantSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [paperTradeStatus, setPaperTradeStatus] = useState<Record<number, TradeStatus>>({});
  const [binanceStatus, setBinanceStatus] = useState<Record<number, BinStatus>>({});
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanInfo, setScanInfo] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [sortBy, setSortBy] = useState<SortBy>("confidence");
  const [portfolioBalance, setPortfolioBalance] = useState<number>(1000);

  useEffect(() => {
    Promise.all([
      fetch("/api/signals?active=true&limit=30").then((r) => r.json()),
      fetch("/api/portfolio/balance").then((r) => r.json()),
    ])
      .then(([sigData, balData]) => {
        setSignals(sigData.signals ?? []);
        setPortfolioBalance(balData.balanceUsd ?? 1000);
      })
      .catch(() => setSignals([]))
      .finally(() => setLoading(false));
  }, []);

  async function runScan(tokens: PortfolioToken[], label: string) {
    setScanning(true);
    setScanError(null);
    setScanInfo(null);
    try {
      const res = await fetch("/api/signals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokens }),
      });
      if (!res.ok) throw new Error("Signal generation failed — is the quant engine running?");
      const data = await res.json();
      const count = data.signals?.length ?? 0;
      setScanInfo(`${label}: ${count} signal${count !== 1 ? "s" : ""} generated`);
      setSignals((prev) => {
        const newIds = new Set<number>((data.signals ?? []).map((s: QuantSignal) => s.id));
        return [...(data.signals ?? []), ...prev.filter((s) => !newIds.has(s.id))];
      });
    } catch (e) {
      setScanError((e as Error).message);
    } finally {
      setScanning(false);
    }
  }

  async function scanPortfolio() {
    if (!address || !chain) return;
    const allowedSymbols = new Set(QUICK_SCAN_TOKENS.map((t) => t.symbol));
    try {
      const res = await fetch(`/api/portfolio?address=${address}&chainId=${chain.id}`);
      if (!res.ok) throw new Error("Portfolio fetch failed — check wallet connection");
      const port = await res.json();
      const tokens: PortfolioToken[] = [port.nativeToken, ...(port.tokens ?? [])]
        .filter((t: PortfolioToken) => t?.symbol && allowedSymbols.has(t.symbol));
      if (!tokens.length) {
        setScanError("No CMC top-30 tokens found in wallet. Try Quick Scan instead.");
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

  function getKellyCap(): number {
    return parseFloat(localStorage.getItem("deepdive_kelly_cap") ?? "0.25");
  }

  async function openBinanceTrade(signal: QuantSignal) {
    if (signal.signal === "HOLD" || !signal.targetPrice || !signal.stopPrice) return;
    setBinanceStatus((s) => ({ ...s, [signal.id]: "opening" }));
    const kellyFraction = Math.min(signal.kellyFraction ?? 0.05, getKellyCap());
    try {
      const res = await fetch("/api/positions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signalId: signal.id,
          symbol: signal.symbol,
          direction: signal.signal === "BUY" ? "LONG" : "SHORT",
          currentPrice: signal.priceAtSignal,
          targetPrice: signal.targetPrice,
          stopPrice: signal.stopPrice,
          kellyFraction,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setBinanceStatus((s) => ({ ...s, [signal.id]: data.skipped ? "skipped" : "done" }));
    } catch {
      setBinanceStatus((s) => ({ ...s, [signal.id]: "error" }));
    }
  }

  async function openPaperTrade(signal: QuantSignal) {
    setPaperTradeStatus((s) => ({ ...s, [signal.id]: "opening" }));
    const positionSizeFraction = Math.min(signal.kellyFraction ?? 0.05, getKellyCap());
    const leverage = signal.suggestedLeverage ?? 1.0;
    try {
      const res = await fetch("/api/performance/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signalId: signal.id,
          symbol: signal.symbol,
          signal: signal.signal,
          entryPrice: signal.priceAtSignal,
          positionSizeFraction,
          leverage,
          targetPrice: signal.targetPrice ?? signal.priceAtSignal,
          stopPrice: signal.stopPrice ?? signal.priceAtSignal,
          confidence: signal.confidence,
          regime: signal.regime,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Refresh balance after opening a trade (margin reserved)
      fetch("/api/portfolio/balance").then((r) => r.json()).then((d) => setPortfolioBalance(d.balanceUsd ?? portfolioBalance));
      setPaperTradeStatus((s) => ({ ...s, [signal.id]: "done" }));
    } catch {
      setPaperTradeStatus((s) => ({ ...s, [signal.id]: "error" }));
    }
  }

  const sorted = useMemo(
    () =>
      [...signals].sort(
        sortBy === "confidence"
          ? (a, b) => b.confidence - a.confidence
          : (a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime()
      ),
    [signals, sortBy]
  );

  const filtered = useMemo(
    () => (filter === "ALL" ? sorted : sorted.filter((s) => s.signal === filter)),
    [sorted, filter]
  );

  const counts = useMemo(
    () => ({
      ALL:  signals.length,
      BUY:  signals.filter((s) => s.signal === "BUY").length,
      SELL: signals.filter((s) => s.signal === "SELL").length,
      HOLD: signals.filter((s) => s.signal === "HOLD").length,
    }),
    [signals]
  );

  const heroSignal = useMemo(
    () => (filter === "HOLD" ? null : (filtered.find((s) => s.signal !== "HOLD") ?? null)),
    [filtered, filter]
  );
  const listSignals = useMemo(
    () => (heroSignal ? filtered.filter((s) => s.id !== heroSignal.id) : filtered),
    [heroSignal, filtered]
  );

  return (
    <div className="space-y-4">
      {/* Control strip */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold tracking-tight">Signals</h1>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={quickScan}
            disabled={scanning}
            className="min-h-[40px] rounded-xl border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-surface disabled:opacity-40"
          >
            {scanning ? "Scanning…" : "Quick Scan"}
          </button>
          <button
            onClick={scanPortfolio}
            disabled={scanning || !address}
            title={!address ? "Connect wallet first" : undefined}
            className="min-h-[40px] rounded-xl bg-accent px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
          >
            {scanning ? "Scanning…" : "Scan Portfolio"}
          </button>
        </div>
      </div>

      {!address && (
        <p className="text-sm text-text-muted">
          Connect wallet to scan your portfolio, or use Quick Scan for popular tokens.
        </p>
      )}

      {/* Status announcements */}
      <div role="status" aria-live="polite" aria-atomic="true">
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
      </div>

      {/* Filter pills + sort toggle */}
      {signals.length > 0 && (
        <div className="flex items-center gap-1">
          {(["ALL", "BUY", "SELL", "HOLD"] as const).map((f) => {
            const isActive = filter === f;
            const activeStyle =
              f === "BUY"  ? "bg-success/20 text-success" :
              f === "SELL" ? "bg-danger/20 text-danger"   :
              f === "HOLD" ? "bg-warning/15 text-warning"  :
                            "bg-surface-elevated text-text-primary";
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  isActive ? activeStyle : "text-text-muted hover:text-text-secondary"
                }`}
              >
                {f}{counts[f] > 0 ? ` (${counts[f]})` : ""}
              </button>
            );
          })}
          <button
            onClick={() => setSortBy((s) => (s === "confidence" ? "recency" : "confidence"))}
            className="ml-auto flex min-h-[36px] items-center px-2 text-xs text-text-muted transition-colors hover:text-text-secondary"
          >
            ↕ {sortBy === "confidence" ? "Confidence" : "Recency"}
          </button>
        </div>
      )}

      {/* Loading skeletons */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-surface" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && signals.length === 0 && (
        <div className="rounded-xl border border-border bg-surface p-6 space-y-4">
          <div>
            <p className="font-medium text-text-secondary">No signals yet</p>
            <p className="mt-1 text-sm text-text-muted">
              Run a scan to generate quant signals from the Kalman, OU, and HMM models.
            </p>
          </div>
          <div className="space-y-2">
            <div className="rounded-lg bg-surface-elevated p-3">
              <p className="text-sm font-medium">Quick Scan</p>
              <p className="mt-0.5 text-xs text-text-muted">
                Scans 20 major tokens — BTC, ETH, SOL, and more. No wallet needed.
              </p>
              <button
                onClick={quickScan}
                disabled={scanning}
                className="mt-2 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
              >
                {scanning ? "Scanning…" : "Quick Scan (20 tokens)"}
              </button>
            </div>
            <div className="rounded-lg bg-surface-elevated p-3">
              <p className="text-sm font-medium">Scan Portfolio</p>
              <p className="mt-0.5 text-xs text-text-muted">
                Scans tokens in your connected wallet. Skips stablecoins automatically.
              </p>
              <button
                onClick={scanPortfolio}
                disabled={scanning || !address}
                className="mt-2 rounded-lg border border-border px-3 py-1.5 text-sm font-medium disabled:opacity-40"
              >
                {!address ? "Connect wallet first" : scanning ? "Scanning…" : "Scan Portfolio"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hero card — highest-confidence non-HOLD */}
      {!loading && heroSignal && (
        <HeroCard
          signal={heroSignal}
          portfolioBalance={portfolioBalance}
          tradeStatus={paperTradeStatus[heroSignal.id] ?? "idle"}
          bStatus={binanceStatus[heroSignal.id] ?? "idle"}
          onPaper={() => openPaperTrade(heroSignal)}
          onBinance={() => openBinanceTrade(heroSignal)}
        />
      )}

      {/* Remaining signal list */}
      {!loading && listSignals.length > 0 && (
        <div className="space-y-2">
          {heroSignal && (
            <p className="px-0.5 text-xs text-text-muted">
              {filter === "ALL" ? "All other signals" : `Other ${filter} signals`}
            </p>
          )}
          {listSignals.map((signal) => (
            <SignalCard
              key={signal.id}
              signal={signal}
              portfolioBalance={portfolioBalance}
              isExpanded={expanded === signal.id}
              onToggle={() => setExpanded(expanded === signal.id ? null : signal.id)}
              tradeStatus={paperTradeStatus[signal.id] ?? "idle"}
              bStatus={binanceStatus[signal.id] ?? "idle"}
              onPaper={() => openPaperTrade(signal)}
              onBinance={() => openBinanceTrade(signal)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
