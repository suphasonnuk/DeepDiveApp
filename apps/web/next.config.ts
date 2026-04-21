import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: "standalone",
  eslint: { ignoreDuringBuilds: true },

  // Required for monorepo standalone builds: trace files from the repo root
  // so workspace packages (packages/db, packages/crypto, etc.) are included.
  outputFileTracingRoot: path.join(__dirname, "../../"),

  transpilePackages: [
    "@deepdive/crypto",
    "@deepdive/chains",
    "@deepdive/db",
  ],
  serverExternalPackages: [
    "@libsql/client",
    "@libsql/hrana-client",
    "@libsql/isomorphic-ws",
    "@libsql/linux-x64-gnu",
    "@libsql/linux-x64-musl",
    "@libsql/win32-x64-msvc",
    "@libsql/darwin-x64",
    "@libsql/darwin-arm64",
    "libsql",
    "drizzle-orm",
    "better-sqlite3",
  ],
  webpack: (config) => {
    config.externals.push(
      // Native libsql binaries
      "@libsql/win32-x64-msvc",
      "@libsql/linux-x64-gnu",
      "@libsql/darwin-arm64",
      "@libsql/darwin-x64",
      "@libsql/client",
      "libsql",
      // Optional WalletConnect / WebSocket deps not present in Docker
      "pino-pretty",
      "lokijs",
      "encoding",
      "bufferutil",
      "utf-8-validate",
      "@react-native-async-storage/async-storage",
    );
    return config;
  },
};

export default nextConfig;
