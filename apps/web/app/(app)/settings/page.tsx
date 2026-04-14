import { TrackedWallets } from "./components/TrackedWallets";
import { SmartMoneyDiscovery } from "./components/SmartMoneyDiscovery";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Settings</h1>

      {/* Tracked Wallets for Copy Trading */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-text-secondary">
          Tracked Wallets (Copy Trading)
        </h2>
        <div className="rounded-xl border border-border bg-surface p-4">
          <TrackedWallets />
        </div>
      </div>

      {/* Smart Money Discovery */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-text-secondary">
          Smart Money Discovery
        </h2>
        <div className="rounded-xl border border-border bg-surface p-4">
          <SmartMoneyDiscovery />
        </div>
      </div>

      {/* Other Settings */}
      <div className="space-y-3">
        {[
          { title: "Chain RPCs", desc: "Configure RPC endpoints" },
          { title: "Strategies", desc: "Quant model parameters" },
          { title: "Security", desc: "Passphrase & session settings" },
          { title: "Data", desc: "Export & backup" },
        ].map((item) => (
          <div
            key={item.title}
            className="flex items-center justify-between rounded-xl border border-border bg-surface p-4"
          >
            <div>
              <p className="font-medium">{item.title}</p>
              <p className="mt-0.5 text-sm text-text-secondary">{item.desc}</p>
            </div>
            <span className="text-text-muted">&rarr;</span>
          </div>
        ))}
      </div>
    </div>
  );
}
