"use client";

import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";

export function WalletConnector() {
  const { address, isConnected, chain } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { chains, switchChain } = useSwitchChain();

  if (isConnected && address) {
    return (
      <div className="space-y-4">
        {/* Connected State */}
        <div className="rounded-xl border border-success/30 bg-success/10 p-4">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-success"></div>
            <p className="text-sm font-medium">Wallet Connected</p>
          </div>
          <p className="mt-2 font-mono text-sm text-text-secondary">
            {address.slice(0, 6)}...{address.slice(-4)}
          </p>
          {chain && (
            <p className="mt-1 text-xs text-text-muted">
              Network: {chain.name}
            </p>
          )}
        </div>

        {/* Chain Switcher */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-text-secondary">Switch Network</p>
          <div className="grid grid-cols-2 gap-2">
            {chains.map((c) => (
              <button
                key={c.id}
                onClick={() => switchChain({ chainId: c.id })}
                disabled={chain?.id === c.id}
                className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                  chain?.id === c.id
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border bg-surface hover:border-accent/50"
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>

        {/* Disconnect Button */}
        <button
          onClick={() => disconnect()}
          className="w-full rounded-lg border border-danger/30 bg-danger/10 py-2.5 text-sm font-medium text-danger transition-colors hover:bg-danger/20"
        >
          Disconnect Wallet
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-text-secondary">
        Connect your wallet to manage portfolio and execute trades
      </p>

      {/* Connector Buttons */}
      <div className="space-y-2">
        {connectors.map((connector) => (
          <button
            key={connector.id}
            onClick={() => connect({ connector })}
            disabled={isPending}
            className="flex w-full items-center justify-between rounded-xl border border-border bg-surface p-4 transition-colors hover:border-accent/50 disabled:opacity-50"
          >
            <div className="text-left">
              <p className="font-medium">{connector.name}</p>
              <p className="mt-0.5 text-xs text-text-muted">
                {connector.id === "injected" && "MetaMask, Rabby, and other browser wallets"}
                {connector.id === "walletConnect" &&
                  "Hardware wallets (Ledger, Trezor) & mobile wallets"}
              </p>
            </div>
            <span className="text-text-muted">&rarr;</span>
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-warning/30 bg-warning/10 p-3">
        <p className="text-xs text-warning">
          Your private keys never leave your wallet. All signing happens
          securely in your device.
        </p>
      </div>
    </div>
  );
}
