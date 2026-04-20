import { WalletConnector } from "./components/WalletConnector";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Settings</h1>

      {/* Wallet Connection */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-text-secondary">Wallet</h2>
        <div className="rounded-xl border border-border bg-surface p-4">
          <WalletConnector />
        </div>
      </div>

      {/* Quant Engine Config */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-text-secondary">Quant Engine</h2>
        {[
          {
            title: "Signal Models",
            desc: "Kalman Filter · Ornstein-Uhlenbeck · HMM · Kelly Criterion",
          },
          {
            title: "Price Data",
            desc: "Binance public API · CoinGecko free tier",
          },
          {
            title: "Paper Trading",
            desc: "All trades are simulated — no real execution",
          },
        ].map((item) => (
          <div
            key={item.title}
            className="rounded-xl border border-border bg-surface p-4"
          >
            <p className="font-medium">{item.title}</p>
            <p className="mt-0.5 text-sm text-text-secondary">{item.desc}</p>
          </div>
        ))}
      </div>

      {/* Security & Data */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-text-secondary">Security & Data</h2>
        {[
          { title: "Session", desc: "Passphrase-based JWT · 1 hour expiry" },
          { title: "Encryption", desc: "AES-256-GCM · PBKDF2 600k iterations · IndexedDB" },
          { title: "Privacy", desc: "Portfolio data never sent to server" },
        ].map((item) => (
          <div
            key={item.title}
            className="flex items-center justify-between rounded-xl border border-border bg-surface p-4"
          >
            <div>
              <p className="font-medium">{item.title}</p>
              <p className="mt-0.5 text-sm text-text-secondary">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
