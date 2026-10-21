Status: resolved
Blocked by: 01

# Frontend bridge and sync message contract

Content script on https://gamelist.sojusan.pl and http://localhost:5173. Announce on load, handle SYNC {platform} via window.postMessage, respond {platform, status: ok|not_logged_in|error, titles[], count}. Background dispatcher to per-platform adapters; de-dupe titles. Document the versioned contract in docs/.

## Answer

Implemented src/contract.ts, src/bridge.ts (content script), src/sync.ts + src/background.ts (dispatcher), adapter interface in src/platforms/adapter.ts (adapters throw NotLoggedInError). Contract documented in docs/frontend-contract.md. Adapters register in src/platforms/index.ts.
