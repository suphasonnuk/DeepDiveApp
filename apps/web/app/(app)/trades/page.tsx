import { TradeSignals } from "./components/TradeSignals";

export default function TradesPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Trades</h1>
        <button className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium transition-colors hover:border-accent/50">
          Sync Now
        </button>
      </div>

      <TradeSignals />
    </div>
  );
}
