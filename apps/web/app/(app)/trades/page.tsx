"use client";

import { useState, useEffect } from "react";

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
      <p className="mt-0.5 text-base font-bold">{value}</p>
      {sub && <p className="text-xs text-text-muted">{sub}</p>}
    </div>
  );
}

export default function PerformancePage() {
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);
  const [trades, setTrades] = useState<PaperTrade[]>([]);
  const [tab, setTab] = useState<"open" | "closed">("open");
  const [loading, setLoading] = useState(true);
  const [closingId, setClosingId] = useState<number | null>(null);
  const [closePrice, setClosePrice] = useState("");

  async function refresh() {
    setLoading(true);
    const [metRes, tradeRes] = await Promise.allSettled([
      fetch("/api/performance").then((r) => r.json()),
      fetch("/api/performance/trades?limit=100").then((r) => r.json()),
    ]);
    if (metRes.status === "fulfilled") setMetrics(metRes.value);
    if (tradeRes.status === "fulfilled") setTrades(tradeRes.value.trades ?? []);
    setLoading(false);
  }

  useEffect(() => { refresh(); }, []);

  async function closeTrade(id: number, exitPrice: number) {
    await fetch(`/api/performance/trades/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exitPrice }),
    });
    setClosingId(null);
    setClosePrice("");
    refresh();
  }

  const openTrades = trades.filter((t) => t.status === "open");
  const closedTrades = trades.filter((t) => t.status !== "open");
  const displayTrades = tab === "open" ? openTrades : closedTrades;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Performance</h1>

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

      {/* Equity curve (simple sparkline) */}
      {metrics && metrics.equityCurve.length > 1 && (
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="mb-2 text-xs text-text-muted">Equity Curve</p>
          <div className="flex h-16 items-end gap-px">
            {metrics.equityCurve.map((v, i) => {
              const min = Math.min(...metrics.equityCurve);
              const max = Math.max(...metrics.equityCurve);
              const range = max - min || 1;
              const h = Math.round(((v - min) / range) * 100);
              const isPositive = v >= metrics.equityCurve[0];
              return (
                <div
                  key={i}
                  style={{ height: `${Math.max(h, 2)}%`, flex: 1 }}
                  className={`rounded-sm ${isPositive ? "bg-success/60" : "bg-danger/60"}`}
                />
              );
            })}
          </div>
          <div className="mt-1 flex justify-between text-xs text-text-muted">
            <span>Start</span>
            <span>
              {metrics.equityCurve.length > 0
                ? `${((metrics.equityCurve[metrics.equityCurve.length - 1] - 1) * 100).toFixed(2)}% total`
                : ""}
            </span>
          </div>
        </div>
      )}

      {/* Trade list */}
      <div className="flex gap-2">
        {(["open", "closed"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors capitalize ${
              tab === t
                ? "bg-accent text-white"
                : "border border-border bg-surface text-text-secondary hover:border-accent/50"
            }`}
          >
            {t === "open" ? `Open (${openTrades.length})` : `Closed (${closedTrades.length})`}
          </button>
        ))}
      </div>

      {loading && !trades.length && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-surface" />
          ))}
        </div>
      )}

      {!loading && displayTrades.length === 0 && (
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

      <div className="space-y-2">
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
                    <div className="flex gap-2">
                      <input
                        type="number"
                        placeholder="Exit price"
                        value={closePrice}
                        onChange={(e) => setClosePrice(e.target.value)}
                        className="flex-1 rounded-lg border border-border bg-surface-elevated px-3 py-1.5 text-sm focus:border-accent focus:outline-none"
                      />
                      <button
                        disabled={!closePrice}
                        onClick={() => closeTrade(trade.id, parseFloat(closePrice))}
                        className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
                      >
                        Close
                      </button>
                      <button
                        onClick={() => { setClosingId(null); setClosePrice(""); }}
                        className="rounded-lg border border-border px-3 py-1.5 text-sm text-text-muted"
                      >
                        Cancel
                      </button>
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
      </div>
    </div>
  );
}
