import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
    "libsql",
    "drizzle-orm",
    "better-sqlite3",
  ],
};

export default nextConfig;
