"use client";

import { useState, useEffect } from "react";

interface BalanceData {
  balanceUsd: number;
  initialBalanceUsd: number;
  realizedPnlUsd: number;
  totalReturnPct: number;
}

export function BalanceSettings() {
  const [data, setData] = useState<BalanceData | null>(null);
  const [input, setInput] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/portfolio/balance")
      .then((r) => r.json())
      .then((d: BalanceData) => {
        setData(d);
        setInput(String(d.balanceUsd));
      })
      .catch(() => {});
  }, []);

  async function handleSave() {
    const newBalance = parseFloat(input);
    if (!newBalance || newBalance <= 0) return;
    setSaving(true);
    try {
      const res = await fetch("/api/portfolio/balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ balanceUsd: newBalance }),
      });
      if (res.ok) {
        const d = await res.json();
        setData((prev) =>
          prev
            ? { ...prev, balanceUsd: d.balanceUsd, initialBalanceUsd: d.initialBalanceUsd, totalReturnPct: 0, realizedPnlUsd: 0 }
            : prev
        );
        setSaved(true);
        setConfirming(false);
        setTimeout(() => setSaved(false), 2500);
      }
    } finally {
      setSaving(false);
    }
  }

  const isUp = (data?.totalReturnPct ?? 0) >= 0;
  const inputVal = parseFloat(input);
  const inputValid = !isNaN(inputVal) && inputVal >= 10;

  return (
    <div className="space-y-4">
      {/* Current state */}
      {data && (
        <div className="rounded-xl border border-border bg-surface divide-y divide-border">
          <div className="flex items-center justify-between px-4 py-3">
            <p className="text-sm text-text-muted">Current Balance</p>
            <p className="font-mono font-semibold">${data.balanceUsd.toFixed(2)}</p>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <p className="text-sm text-text-muted">Starting Balance</p>
            <p className="font-mono text-text-secondary">${data.initialBalanceUsd.toFixed(2)}</p>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <p className="text-sm text-text-muted">Total Return</p>
            <p className={`font-mono font-semibold ${isUp ? "text-success" : "text-danger"}`}>
              {isUp ? "+" : ""}{data.totalReturnPct.toFixed(2)}%
            </p>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <p className="text-sm text-text-muted">Realized P&L</p>
            <p className={`font-mono font-semibold ${data.realizedPnlUsd >= 0 ? "text-success" : "text-danger"}`}>
              {data.realizedPnlUsd >= 0 ? "+" : ""}${data.realizedPnlUsd.toFixed(2)}
            </p>
          </div>
        </div>
      )}

      {/* Set new balance */}
      <div className="space-y-2">
        <p className="text-sm font-medium">Reset Starting Balance</p>
        <p className="text-xs text-text-muted">
          Sets a new paper trading capital. Open trades remain active.
        </p>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-text-muted">
              $
            </span>
            <input
              type="number"
              inputMode="decimal"
              min="10"
              step="100"
              value={input}
              onChange={(e) => { setInput(e.target.value); setConfirming(false); setSaved(false); }}
              placeholder="1000"
              className="w-full rounded-xl border border-border bg-surface-elevated pl-7 pr-3 py-2.5 focus:border-accent focus:outline-none"
            />
          </div>

          {!confirming ? (
            <button
              onClick={() => setConfirming(true)}
              disabled={!inputValid}
              className="min-h-[44px] rounded-xl border border-border px-4 text-sm font-medium transition-colors hover:border-accent/50 disabled:opacity-40"
            >
              Set
            </button>
          ) : (
            <div className="flex gap-1.5">
              <button
                onClick={handleSave}
                disabled={saving}
                className="min-h-[44px] rounded-xl bg-accent px-4 text-sm font-medium text-white disabled:opacity-50"
              >
                {saving ? "Saving…" : saved ? "Saved ✓" : "Confirm"}
              </button>
              <button
                onClick={() => setConfirming(false)}
                className="min-h-[44px] rounded-xl border border-border px-3 text-sm text-text-muted"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {saved && (
          <p className="text-xs text-success">Balance reset to ${parseFloat(input).toFixed(2)}</p>
        )}
      </div>
    </div>
  );
}
