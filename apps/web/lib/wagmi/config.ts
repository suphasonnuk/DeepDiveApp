import { http, createConfig, type Config } from "wagmi";
import { mainnet, arbitrum, base, polygon } from "wagmi/chains";
import { injected, walletConnect } from "wagmi/connectors";

// WalletConnect project ID (get from https://cloud.walletconnect.com)
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "";

export const wagmiConfig: Config = createConfig({
  chains: [mainnet, arbitrum, base, polygon],
  connectors: [
    // MetaMask, Rabby, and other browser wallets
    injected(),

    // Hardware wallets via WalletConnect (Ledger, Trezor, etc.)
    walletConnect({
      projectId,
      metadata: {
        name: "DeepDive",
        description: "Personal crypto portfolio management",
        url: typeof window !== "undefined" ? window.location.origin : "",
        icons: [],
      },
      showQrModal: true,
    }),
  ],
  transports: {
    [mainnet.id]: http(process.env.NEXT_PUBLIC_RPC_ETHEREUM),
    [arbitrum.id]: http(process.env.NEXT_PUBLIC_RPC_ARBITRUM),
    [base.id]: http(process.env.NEXT_PUBLIC_RPC_BASE),
    [polygon.id]: http(process.env.NEXT_PUBLIC_RPC_POLYGON),
  },
});
