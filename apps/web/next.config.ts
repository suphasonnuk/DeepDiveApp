import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: "standalone",

  // Required for monorepo standalone builds: trace files from the repo root
  // so workspace packages (packages/db, packages/crypto, etc.) are included.
  outputFileTracingRoot: path.join(__dirname, "../../"),

  transpilePackages: [
    "@deepdive/crypto",
    "@deepdive/chains",
    "@deepdive/stores",
    "@deepdive/ui",
  ],
  serverExternalPackages: [
    "@deepdive/db",
    "@libsql/client",
    "@libsql/hrana-client",
    "@libsql/isomorphic-ws",
    "@libsql/linux-x64-gnu",
    "@libsql/win32-x64-msvc",
    "@libsql/darwin-x64",
    "@libsql/darwin-arm64",
    "libsql",
    "drizzle-orm",
    "better-sqlite3",
  ],
};

export default nextConfig;
