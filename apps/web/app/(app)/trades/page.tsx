"use client";

import { useState, useEffect, useCallback } from "react";

interface PaperTrade {
  id: number;
  symbol: string;
  signal: string;
  entryPrice: number;
  exitPrice: number | null;
  positionSizeFraction: number;
  targetPrice: number;
  stopPrice: number;
  confidence: number;
  regime: string;
  status: string;
  pnlPct: number | null;
  openedAt: string;
  closedAt: string | null;
}

interface AutoPosition {
  id: number;
  symbol: string;
  futuresSymbol: string;
  direction: string;
  leverage: number;
  entryPrice: number;
  targetPrice: number;
  stopPrice: number;
  quantity: number;
  positionSizeUsdt: number;
  status: string;
  exitPrice: number | null;
  pnlUsdt: number | null;
  pnlPct: number | null;
  closeReason: string | null;
  openedAt: string;
  closedAt: string | null;
}

interface PerformanceMetrics {
  totalTrades: number;
  openTrades: number;
  winRate: number;
  avgPnlPct: number;
  sharpeRatio: number;
  maxDrawdownPct: number;
  profitFactor: number;
  equityCurve: number[];
}

const STATUS_STYLE: Record<string, { label: string; color: string }> = {
  open:           { label: "Open",     color: "text-accent" },
  closed_profit:  { label: "Profit",   color: "text-success" },
  closed_loss:    { label: "Loss",     color: "text-danger" },
  closed_target:  { label: "Target ✓", color: "text-success" },
  closed_stop:    { label: "Stop ✗",   color: "text-danger" },
};

const SIGNAL_COLOR: Record<string, string> = { BUY: "text-success", SELL: "text-danger" };

function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <p className="text-xs text-text-muted">{label}</p>
      <p className="font-display mt-0.5 text-lg font-bold">{value}</p>
      {sub && <p className="text-xs text-text-muted">{sub}</p>}
    </div>
  );
}

const POS_STATUS: Record<string, { label: string; color: string }> = {
  open:      { label: "Live",      color: "text-accent" },
  closed_tp: { label: "Target ✓",  color: "text-success" },
  closed_sl: { label: "Stop ✗",    color: "text-danger" },
  error:     { label: "Error",     color: "text-warning" },
};

export default function PerformancePage() {
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);
  const [trades, setTrades] = useState<PaperTrade[]>([]);
  const [positions, setPositions] = useState<AutoPosition[]>([]);
  const [tab, setTab] = useState<"positions" | "open" | "closed">("positions");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [closingId, setClosingId] = useState<number | null>(null);
  const [closePrice, setClosePrice] = useState("");
  const [closeError, setCloseError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [metRes, tradeRes, posRes] = await Promise.allSettled([
      fetch("/api/performance").then((r) => r.json()),
      fetch("/api/performance/trades?limit=100").then((r) => r.json()),
      fetch("/api/positions").then((r) => r.json()),
    ]);
    if (metRes.status === "fulfilled") setMetrics(metRes.value);
    if (tradeRes.status === "fulfilled") setTrades(tradeRes.value.trades ?? []);
    if (posRes.status === "fulfilled") setPositions(posRes.value.positions ?? []);
    setLoading(false);
  }, []);

  async function syncPositions() {
    setSyncing(true);
    await fetch("/api/positions/sync", { method: "POST" });
    await refresh();
    setSyncing(false);
  }

  useEffect(() => { refresh(); }, [refresh]);

  // Uses the quant model's risk envelope (targetPrice / stopPrice) as the validity boundary.
  // Custom exits beyond 2× target or below 0.5× stop are almost certainly typos in crypto.
  function unusualExitPriceWarning(exitPrice: number, targetPrice: number, stopPrice: number): string | null {
    if (!isFinite(exitPrice) || exitPrice <= 0) return null;
    if (exitPrice > targetPrice * 2) {
      return `${((exitPrice / targetPrice - 1) * 100).toFixed(0)}% above quant target — possible entry error`;
    }
    if (exitPrice < stopPrice * 0.5) {
      return `${((1 - exitPrice / stopPrice) * 100).toFixed(0)}% below quant stop — possible entry error`;
    }
    return null;
  }

  async function closeTrade(id: number, exitPrice: number) {
    if (exitPrice <= 0) {
      setCloseError("Exit price must be greater than zero");
      return;
    }
    setCloseError(null);
    try {
      const res = await fetch(`/api/performance/trades/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exitPrice }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setClosingId(null);
      setClosePrice("");
      refresh();
    } catch (e) {
      setCloseError((e as Error).message);
    }
  }

  const openTrades = trades.filter((t) => t.status === "open");
  const closedTrades = trades.filter((t) => t.status !== "open");
  const displayTrades = tab === "open" ? openTrades : closedTrades;

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold tracking-tight">Performance</h1>

      {/* Equity curve — primary visual anchor; proof the models generate alpha */}
      {metrics && metrics.equityCurve.length > 1 && (() => {
        const curve = metrics.equityCurve;
        const min = Math.min(...curve);
        const max = Math.max(...curve);
        const range = max - min || 1;
        const totalReturn = ((curve[curve.length - 1] - 1) * 100).toFixed(2);
        const peak = ((max - 1) * 100).toFixed(2);
        const isUp = curve[curve.length - 1] >= 1;
        return (
          <div className="rounded-xl border border-border bg-surface p-4">
            <div className="mb-3 flex items-baseline justify-between">
              <p className="text-sm font-medium text-text-secondary">Equity Curve</p>
              <p className={`font-display text-2xl font-bold ${isUp ? "text-success" : "text-danger"}`}>
                {Number(totalReturn) > 0 ? "+" : ""}{totalReturn}%
              </p>
            </div>
            <div className="flex h-28 items-end gap-px">
              {curve.map((v, i) => {
                const h = Math.round(((v - min) / range) * 100);
                const isPositive = v >= 1;
                return (
                  <div
                    key={i}
                    style={{ height: `${Math.max(h, 2)}%`, flex: 1 }}
                    className={`rounded-sm ${isPositive ? "bg-success/60" : "bg-danger/60"}`}
                  />
                );
              })}
            </div>
            <div className="mt-2 flex justify-between text-xs text-text-muted">
              <span>Baseline (1.0×)</span>
              <span>Peak +{peak}%</span>
              <span>{curve.length} trades</span>
            </div>
          </div>
        );
      })()}

      {/* Metrics grid */}
      {loading && !metrics ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-surface" />
          ))}
        </div>
      ) : metrics ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <MetricCard
            label="Win Rate"
            value={metrics.totalTrades ? `${metrics.winRate.toFixed(1)}%` : "--"}
            sub={`${metrics.totalTrades} closed trades`}
          />
          <MetricCard
            label="Sharpe Ratio"
            value={metrics.totalTrades ? metrics.sharpeRatio.toFixed(2) : "--"}
            sub="annualised"
          />
          <MetricCard
            label="Max Drawdown"
            value={metrics.totalTrades ? `${metrics.maxDrawdownPct.toFixed(2)}%` : "--"}
          />
          <MetricCard
            label="Avg P&L"
            value={metrics.totalTrades ? `${metrics.avgPnlPct > 0 ? "+" : ""}${metrics.avgPnlPct.toFixed(2)}%` : "--"}
            sub="per trade"
          />
          <MetricCard
            label="Profit Factor"
            value={metrics.totalTrades && metrics.profitFactor !== Infinity
              ? metrics.profitFactor.toFixed(2)
              : metrics.totalTrades ? "∞" : "--"}
          />
          <MetricCard
            label="Open Trades"
            value={String(metrics.openTrades)}
          />
        </div>
      ) : null}

      {/* Tabs */}
      <div className="flex gap-2">
        {(["positions", "open", "closed"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors capitalize ${
              tab === t
                ? "bg-accent text-white"
                : "border border-border bg-surface text-text-secondary hover:border-accent/50"
            }`}
          >
            {t === "positions"
              ? `Binance (${positions.filter(p => p.status === "open").length})`
              : t === "open"
              ? `Paper Open (${openTrades.length})`
              : `Paper Closed (${closedTrades.length})`}
          </button>
        ))}
      </div>

      {/* Binance Positions panel */}
      {tab === "positions" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-text-muted">{positions.length} total positions on Binance Futures Testnet</p>
            <button
              onClick={syncPositions}
              disabled={syncing}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-surface disabled:opacity-40"
            >
              {syncing ? "Syncing..." : "Sync from Binance"}
            </button>
          </div>

          {positions.length === 0 && !loading && (
            <div className="rounded-xl border border-border bg-surface p-8 text-center">
              <p className="font-medium text-text-secondary">No positions yet</p>
              <p className="mt-1 text-sm text-text-muted">
                Go to Signals → Quick Scan. BUY/SELL signals auto-open positions on Binance Testnet.
              </p>
            </div>
          )}

          {positions.map((pos) => {
            const st = POS_STATUS[pos.status] ?? { label: pos.status, color: "text-text-muted" };
            const isLong = pos.direction === "LONG";
            return (
              <div key={pos.id} className="rounded-xl border border-border bg-surface p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-bold ${isLong ? "text-success" : "text-danger"}`}>
                        {pos.direction}
                      </span>
                      <span className="font-medium">{pos.futuresSymbol}</span>
                      <span className="rounded bg-surface-elevated px-1.5 py-0.5 text-xs text-text-muted">
                        {pos.leverage}×
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-text-muted">
                      Entry ${pos.entryPrice.toPrecision(5)}
                      {pos.exitPrice != null && ` → Exit $${pos.exitPrice.toPrecision(5)}`}
                    </p>
                    <p className="text-xs text-text-muted">
                      TP ${pos.targetPrice.toPrecision(5)} · SL ${pos.stopPrice.toPrecision(5)}
                    </p>
                    <p className="text-xs text-text-muted">
                      Size ${pos.positionSizeUsdt.toFixed(2)} · {pos.quantity} {pos.symbol}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-semibold ${st.color}`}>{st.label}</p>
                    {pos.pnlUsdt != null && (
                      <p className={`text-xs font-medium ${pos.pnlUsdt >= 0 ? "text-success" : "text-danger"}`}>
                        {pos.pnlUsdt >= 0 ? "+" : ""}${pos.pnlUsdt.toFixed(2)}
                      </p>
                    )}
                    {pos.pnlPct != null && (
                      <p className={`text-xs ${pos.pnlPct >= 0 ? "text-success" : "text-danger"}`}>
                        {pos.pnlPct >= 0 ? "+" : ""}{pos.pnlPct.toFixed(2)}%
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab !== "positions" && loading && !trades.length && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-surface" />
          ))}
        </div>
      )}

      {tab !== "positions" && !loading && displayTrades.length === 0 && (
        <div className="rounded-xl border border-border bg-surface p-8 text-center">
          <p className="text-text-muted">
            {tab === "open" ? "No open paper trades." : "No closed trades yet."}
          </p>
          {tab === "open" && (
            <p className="mt-1 text-xs text-text-muted">
              Go to Signals and tap &quot;Open Paper Trade&quot; on a signal.
            </p>
          )}
        </div>
      )}

      {tab !== "positions" && <div className="space-y-2">
        {displayTrades.map((trade) => {
          const statusStyle = STATUS_STYLE[trade.status] ?? { label: trade.status, color: "text-text-muted" };
          const isClosing = closingId === trade.id;

          return (
            <div key={trade.id} className="rounded-xl border border-border bg-surface p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-bold ${SIGNAL_COLOR[trade.signal] ?? "text-text-secondary"}`}>
                      {trade.signal}
                    </span>
                    <span className="font-medium">{trade.symbol}</span>
                    <span className="rounded bg-surface-elevated px-1.5 py-0.5 text-xs text-text-muted">
                      {trade.regime}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-text-muted">
                    Entry: ${trade.entryPrice.toPrecision(5)}
                    {trade.exitPrice != null && ` → Exit: $${trade.exitPrice.toPrecision(5)}`}
                  </p>
                  <p className="text-xs text-text-muted">
                    Kelly {(trade.positionSizeFraction * 100).toFixed(1)}%
                    {" · "}{Math.round(trade.confidence * 100)}% conf
                  </p>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-semibold ${statusStyle.color}`}>
                    {statusStyle.label}
                  </p>
                  {trade.pnlPct != null && (
                    <p className={`text-xs font-medium ${trade.pnlPct >= 0 ? "text-success" : "text-danger"}`}>
                      {trade.pnlPct > 0 ? "+" : ""}{trade.pnlPct.toFixed(2)}%
                    </p>
                  )}
                </div>
              </div>

              {/* Close trade form */}
              {trade.status === "open" && (
                <div className="mt-3 border-t border-border pt-3">
                  {isClosing ? (
                    <div className="space-y-2">
                      {/* Quant model's pre-calculated exit levels — primary actions */}
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => closeTrade(trade.id, trade.targetPrice)}
                          className="rounded-lg bg-success/10 px-3 py-2 text-left transition-colors hover:bg-success/20"
                        >
                          <p className="text-xs text-text-muted">Target hit</p>
                          <p className="text-sm font-semibold text-success">${trade.targetPrice.toPrecision(5)}</p>
                          <p className="text-xs text-success">
                            +{(((trade.targetPrice - trade.entryPrice) / trade.entryPrice) * 100).toFixed(2)}%
                          </p>
                        </button>
                        <button
                          onClick={() => closeTrade(trade.id, trade.stopPrice)}
                          className="rounded-lg bg-danger/10 px-3 py-2 text-left transition-colors hover:bg-danger/20"
                        >
                          <p className="text-xs text-text-muted">Stop hit</p>
                          <p className="text-sm font-semibold text-danger">${trade.stopPrice.toPrecision(5)}</p>
                          <p className="text-xs text-danger">
                            {(((trade.stopPrice - trade.entryPrice) / trade.entryPrice) * 100).toFixed(2)}%
                          </p>
                        </button>
                      </div>
                      {/* Custom exit — for mid-trade discretionary closes */}
                      <div className="flex gap-2">
                        <input
                          type="number"
                          min="0.000001"
                          step="any"
                          placeholder="Custom exit price"
                          value={closePrice}
                          onChange={(e) => { setClosePrice(e.target.value); setCloseError(null); }}
                          className="flex-1 rounded-lg border border-border bg-surface-elevated px-3 py-1.5 text-sm focus:border-accent focus:outline-none"
                        />
                        <button
                          disabled={!closePrice || parseFloat(closePrice) <= 0}
                          onClick={() => closeTrade(trade.id, parseFloat(closePrice))}
                          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
                        >
                          Close
                        </button>
                        <button
                          onClick={() => { setClosingId(null); setClosePrice(""); setCloseError(null); }}
                          className="rounded-lg border border-border px-3 py-1.5 text-sm text-text-muted"
                        >
                          Cancel
                        </button>
                      </div>
                      {closePrice && !closeError && (() => {
                        const w = unusualExitPriceWarning(parseFloat(closePrice), trade.targetPrice, trade.stopPrice);
                        return w ? <p className="text-xs text-warning">⚠ {w}</p> : null;
                      })()}
                      {closeError && closingId === trade.id && (
                        <p className="text-xs text-danger">{closeError}</p>
                      )}
                    </div>
                  ) : (
                    <button
                      onClick={() => setClosingId(trade.id)}
                      className="text-xs text-accent hover:underline"
                    >
                      Close trade
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>}
    </div>
  );
}
