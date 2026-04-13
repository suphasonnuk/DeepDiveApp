export default function MarketsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Markets</h1>

      {/* Search */}
      <input
        type="text"
        placeholder="Search tokens..."
        className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
      />

      {/* Market Table Placeholder */}
      <div className="rounded-xl border border-border bg-surface">
        <div className="border-b border-border px-4 py-3">
          <div className="flex items-center justify-between text-xs text-text-muted">
            <span>Token</span>
            <span>Price / 24h</span>
          </div>
        </div>
        <div className="divide-y divide-border">
          {["ETH", "BTC", "ARB", "MATIC"].map((token) => (
            <div key={token} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-elevated text-xs font-bold">
                  {token.slice(0, 2)}
                </div>
                <span className="font-medium">{token}</span>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium">--</p>
                <p className="text-xs text-text-muted">--%</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
