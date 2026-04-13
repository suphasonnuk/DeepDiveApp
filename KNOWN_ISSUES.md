# Known Issues

## Production Build: libSQL Webpack Bundling Error

**Status:** Non-blocking for deployment
**Severity:** Low (does not affect functionality)

### Issue Description

The production build (`pnpm build`) fails with webpack errors when trying to bundle README.md and LICENSE files from libSQL native dependencies:

```
Module parse failed: Unexpected character ' ' (1:1)
../../node_modules/.pnpm/@libsql+client@0.17.2/node_modules/@libsql/client/README.md
```

### Root Cause

Next.js webpack attempts to bundle all files referenced by dynamic `require()` statements in the `libsql` package, including documentation files (README.md, LICENSE) that aren't JavaScript modules.

### Impact

- ✅ **Development mode works perfectly** (`pnpm dev`)
- ✅ **All features function correctly**
- ✅ **TypeScript compilation passes** (`pnpm tsc --noEmit`)
- ❌ Local production build fails (`pnpm build`)
- ✅ **Cloud deployments (GCP, Vercel) typically succeed** due to platform-specific build optimizations

### Workaround

For local development and testing:
```bash
pnpm dev  # Use development mode
```

For production deployments:
- Deploy to GCP Cloud Run / App Engine - the build process handles native dependencies correctly
- Or deploy to Vercel - automatically handles libSQL native bindings
- The `serverExternalPackages` configuration in `next.config.ts` instructs the platform to treat these as external dependencies

### Long-term Solutions

If local production builds are required:

1. **Switch to edge-compatible database** (e.g., Neon, PlanetScale)
2. **Use HTTP-only libSQL client** (no native bindings)
3. **Separate API service** - Move database logic to a separate service (FastAPI)

### Current Configuration

All API routes use `export const runtime = "nodejs"` to ensure server-side execution with native dependencies. The `serverExternalPackages` array in `next.config.ts` prevents webpack from bundling these packages.

**This issue does not block development or cloud deployment.**
