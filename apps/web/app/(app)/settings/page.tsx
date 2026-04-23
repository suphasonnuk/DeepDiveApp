import { WalletConnector } from "./components/WalletConnector";
import { QuantSettings } from "./components/QuantSettings";
import { BalanceSettings } from "./components/BalanceSettings";

const SECURITY_ITEMS = [
  { label: "Session",    value: "Passphrase JWT · 1 hour expiry" },
  { label: "Encryption", value: "AES-256-GCM · PBKDF2 600k iterations · IndexedDB" },
  { label: "Privacy",    value: "Portfolio data never sent to server" },
] as const;

export default function SettingsPage() {
  return (
    <div className="space-y-10">
      <h1 className="font-display text-2xl font-bold tracking-tight">Settings</h1>

      {/* Wallet */}
      <section className="space-y-4">
        <h2 className="text-xs uppercase tracking-widest text-text-muted">Wallet</h2>
        <WalletConnector />
      </section>

      {/* Paper trading balance */}
      <section className="space-y-4">
        <h2 className="text-xs uppercase tracking-widest text-text-muted">Paper Trading</h2>
        <BalanceSettings />
      </section>

      {/* Signal engine */}
      <section className="space-y-4">
        <h2 className="text-xs uppercase tracking-widest text-text-muted">Signal Engine</h2>
        <QuantSettings />
      </section>

      {/* Security — flat list, no cards */}
      <section className="space-y-4">
        <h2 className="text-xs uppercase tracking-widest text-text-muted">Security & Privacy</h2>
        <div className="space-y-3">
          {SECURITY_ITEMS.map(({ label, value }) => (
            <div key={label} className="flex items-baseline justify-between gap-6">
              <p className="shrink-0 text-sm text-text-muted">{label}</p>
              <p className="text-right text-sm text-text-secondary">{value}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
