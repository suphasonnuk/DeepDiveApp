export default function DashboardPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Dashboard</h1>

      {/* Portfolio Value Card */}
      <div className="rounded-xl border border-border bg-surface p-5">
        <p className="text-sm text-text-secondary">Portfolio Value</p>
        <p className="mt-1 text-3xl font-bold tracking-tight">--</p>
        <p className="mt-1 text-sm text-text-muted">Connect wallet to view</p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-3">
        {["24h P&L", "Open Positions", "Signals"].map((label) => (
          <div key={label} className="rounded-lg border border-border bg-surface p-3 text-center">
            <p className="text-xs text-text-muted">{label}</p>
            <p className="mt-1 text-lg font-semibold">--</p>
          </div>
        ))}
      </div>

      {/* Feature Cards */}
      <div className="space-y-3">
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Active Signals</p>
              <p className="mt-0.5 text-sm text-text-secondary">
                Quant engine offline
              </p>
            </div>
            <span className="text-text-muted">&rarr;</span>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Chain Activity</p>
              <p className="mt-0.5 text-sm text-text-secondary">
                ETH &middot; ARB &middot; Base &middot; Polygon
              </p>
            </div>
            <span className="text-text-muted">&rarr;</span>
          </div>
        </div>
      </div>
    </div>
  );
}
