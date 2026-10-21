Status: resolved
Blocked by: none

# Scaffold extension project

Vite + TypeScript + Preact popup, MV3 manifest for Chromium and Firefox (webextension-polyfill), pnpm, oxlint, oxfmt, Vitest, GitHub Actions CI. Build outputs both bundles. Host permissions scoped per spec.md.

## Answer

Scaffolded: Vite 8 + Preact popup, per-browser manifest (src/manifest.ts), scripts/build.mjs builds dist/chromium and dist/firefox, pnpm/oxlint/oxfmt/Vitest, CI in .github/workflows/ci.yml. Lint, typecheck, tests and build pass locally.
