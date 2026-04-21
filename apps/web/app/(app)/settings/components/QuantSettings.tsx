"use client";

import { useState, useEffect } from "react";

const KELLY_CAP_KEY = "deepdive_kelly_cap";
const DEFAULT_KELLY_CAP = 0.25;

const MODELS = [
  { name: "Kalman Filter",         role: "Fair value · trend velocity" },
  { name: "Ornstein-Uhlenbeck",    role: "Mean-reversion Z-score" },
  { name: "HMM Regime Detection",  role: "BULL / BEAR / SIDEWAYS" },
  { name: "Kelly Criterion",       role: "Optimal position sizing" },
] as const;

const REGIME_WEIGHTS = [
  { regime: "BULL",     kalman: "60%", ou: "40%" },
  { regime: "BEAR",     kalman: "40%", ou: "60%" },
  { regime: "SIDEWAYS", kalman: "20%", ou: "80%" },
] as const;

export function QuantSettings() {
  const [kellyCap, setKellyCap] = useState(DEFAULT_KELLY_CAP);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(KELLY_CAP_KEY);
    if (stored) setKellyCap(parseFloat(stored));
  }, []);

  function handleKellyChange(value: number) {
    setKellyCap(value);
    localStorage.setItem(KELLY_CAP_KEY, String(value));
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  const pctLabel = `${Math.round(kellyCap * 100)}%`;

  return (
    <div className="space-y-8">
      {/* Kelly cap slider — real interactive control */}
      <div>
        <div className="flex items-baseline justify-between mb-1">
          <div>
            <p className="text-sm font-medium">Kelly Fraction Cap</p>
            <p className="mt-0.5 text-xs text-text-muted">
              Maximum position size per signal
            </p>
          </div>
          <span className="font-display text-2xl font-bold text-accent tabular-nums">
            {pctLabel}
          </span>
        </div>
        <input
          type="range"
          min={0.05}
          max={0.25}
          step={0.01}
          value={kellyCap}
          onChange={(e) => handleKellyChange(parseFloat(e.target.value))}
          className="mt-3 w-full accent-accent"
          aria-label="Kelly fraction cap"
          aria-valuenow={Math.round(kellyCap * 100)}
          aria-valuemin={5}
          aria-valuemax={25}
        />
        <div className="mt-1 flex justify-between text-xs text-text-muted">
          <span>5% — conservative</span>
          {saved && <span className="text-success">Saved</span>}
          <span>25% — half-Kelly max</span>
        </div>
      </div>

      {/* Signal models — list, not cards */}
      <div>
        <p className="mb-3 text-xs uppercase tracking-widest text-text-muted">Signal Models</p>
        <div className="space-y-3">
          {MODELS.map((m) => (
            <div key={m.name} className="flex items-baseline justify-between gap-4">
              <p className="text-sm font-medium">{m.name}</p>
              <p className="shrink-0 text-xs text-text-muted">{m.role}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Regime-adaptive weights — compact table */}
      <div>
        <p className="mb-3 text-xs uppercase tracking-widest text-text-muted">
          Regime Weights
        </p>
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <div className="grid grid-cols-3 border-b border-border px-4 py-2 text-xs text-text-muted">
            <span>Regime</span>
            <span className="text-center">Kalman</span>
            <span className="text-right">OU</span>
          </div>
          {REGIME_WEIGHTS.map((row, i) => (
            <div
              key={row.regime}
              className={`grid grid-cols-3 px-4 py-2.5 text-sm ${
                i > 0 ? "border-t border-border" : ""
              }`}
            >
              <span className="font-medium">{row.regime}</span>
              <span className="text-center text-text-secondary">{row.kalman}</span>
              <span className="text-right text-text-secondary">{row.ou}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Data sources */}
      <div>
        <p className="mb-2 text-xs uppercase tracking-widest text-text-muted">Data Sources</p>
        <p className="text-sm text-text-secondary">
          Binance public API · CoinGecko free tier
        </p>
        <p className="mt-0.5 text-xs text-text-muted">
          All trades are paper-simulated — no real capital at risk
        </p>
      </div>
    </div>
  );
}
