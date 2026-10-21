# Platform Sync browser extension

Status: needs-triage

## Decisions (from grilling)

- Browsers: Chromium (Chrome/Edge) and Firefox, Manifest V3, `webextension-polyfill`. Sideloaded first; store publishing later.
- Stack: TypeScript, Vite, Preact (small popup only). Tooling matches game-list-frontend: pnpm, oxlint, oxfmt, Vitest for adapter fixtures, GitHub Actions CI.
- Platforms: Steam, Epic, PlayStation, Nintendo. Each **Platform Sync** fetches owned + wishlist together, flat title list, de-duplicated by exact title. No filtering of DLC/tools (backend Title Import handles it).
- Data access: background script `fetch` with `credentials: 'include'` against each platform's internal JSON/GraphQL endpoints; DOM/page-derived values only where unavoidable (Nintendo query hash / client id). One versioned adapter per platform, a pure parse function tested against recorded fixtures.
- No backend access, no tokens: see ADR-0001.
- Frontend bridge: content script on the frontend origin(s) with `window.postMessage`.
  - Extension announces itself on load; frontend pings with timeout; if absent the frontend shows disabled buttons with an install link.
  - Request `{type: SYNC, platform}`; response `{platform, status: ok | not_logged_in | error, titles[], count}`.
  - `not_logged_in`: the frontend shows the message and a link to the platform login. The extension shows no UI of its own for it.
- Frontend behaviour (separate ticket in game-list-frontend): one button per platform on the Title Import page; titles are appended one per line, de-duplicated against existing textarea content.
- Permissions: `storage` only if needed; host permissions scoped to the four platforms' domains (incl. API/auth hosts); content script matches only frontend origins (`https://gamelist.sojusan.pl` and `http://localhost:5173`).

## Open

- None. Next step: split into tickets under `issues/`, including a frontend ticket for game-list-frontend.
