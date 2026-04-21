"use client";

import { useState, useRef, useEffect } from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";

const CHAIN_NAMES: Record<number, string> = {
  1: "Ethereum",
  42161: "Arbitrum",
  8453: "Base",
  137: "Polygon",
};

export function TopHeader() {
  const { address, isConnected, chain } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { chains, switchChain } = useSwitchChain();

  const [showDropdown, setShowDropdown] = useState(false);
  const [showConnectors, setShowConnectors] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
        setShowConnectors(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-surface/95 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-lg items-center justify-between px-4">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent">
            <span className="text-sm font-bold text-white">DD</span>
          </div>
          <span className="text-lg font-bold">DeepDive</span>
        </div>

        {/* Wallet Button */}
        <div className="relative" ref={dropdownRef}>
          {isConnected && address ? (
            <>
              <button
                onClick={() => setShowDropdown(!showDropdown)}
                aria-haspopup="true"
                aria-expanded={showDropdown}
                className="flex items-center gap-2 rounded-xl border border-border bg-surface-elevated px-3 py-2 text-sm transition-colors hover:border-accent/50"
              >
                <span
                  className="h-2 w-2 rounded-full bg-success"
                  title={chain?.name}
                />
                <span className="font-mono text-xs">
                  {address.slice(0, 6)}...{address.slice(-4)}
                </span>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="none"
                  className={`text-text-muted transition-transform ${showDropdown ? "rotate-180" : ""}`}
                >
                  <path
                    d="M3 4.5L6 7.5L9 4.5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>

              {/* Connected Dropdown */}
              {showDropdown && (
                <div role="menu" className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-border bg-surface p-2 shadow-xl">
                  {/* Current chain */}
                  <div className="px-3 py-2 text-xs text-text-muted">
                    Connected to{" "}
                    <span className="text-text-secondary">
                      {chain?.name || "Unknown"}
                    </span>
                  </div>

                  {/* Chain switcher */}
                  <div className="border-t border-border pt-1 mt-1">
                    <p className="px-3 py-1.5 text-xs text-text-muted">
                      Switch Network
                    </p>
                    {chains.map((c) => (
                      <button
                        key={c.id}
                        role="menuitem"
                        onClick={() => {
                          switchChain({ chainId: c.id });
                          setShowDropdown(false);
                        }}
                        className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                          chain?.id === c.id
                            ? "bg-accent/10 text-accent"
                            : "text-text-secondary hover:bg-surface-elevated"
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${chain?.id === c.id ? "bg-accent" : "bg-text-muted"}`}
                        />
                        {c.name}
                      </button>
                    ))}
                  </div>

                  {/* Disconnect */}
                  <div className="border-t border-border pt-1 mt-1">
                    <button
                      onClick={() => {
                        disconnect();
                        setShowDropdown(false);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-danger transition-colors hover:bg-danger/10"
                    >
                      Disconnect
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <button
                onClick={() => setShowConnectors(!showConnectors)}
                disabled={isPending}
                className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
              >
                {isPending ? "Connecting..." : "Connect Wallet"}
              </button>

              {/* Connector Picker */}
              {showConnectors && (
                <div className="absolute right-0 top-full mt-2 w-64 rounded-xl border border-border bg-surface p-2 shadow-xl">
                  <p className="px-3 py-2 text-xs text-text-muted">
                    Choose Wallet
                  </p>
                  {connectors.map((connector) => (
                    <button
                      key={connector.id}
                      onClick={() => {
                        connect({ connector });
                        setShowConnectors(false);
                      }}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-surface-elevated"
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-elevated">
                        {connector.id === "injected" ? (
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
                            <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
                            <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
                          </svg>
                        ) : (
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M12 2L2 7l10 5 10-5-10-5z" />
                            <path d="M2 17l10 5 10-5" />
                            <path d="M2 12l10 5 10-5" />
                          </svg>
                        )}
                      </div>
                      <div className="text-left">
                        <p className="font-medium">{connector.name}</p>
                        <p className="text-xs text-text-muted">
                          {connector.id === "injected"
                            ? "Browser wallet"
                            : "Mobile & hardware"}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </header>
  );
}
