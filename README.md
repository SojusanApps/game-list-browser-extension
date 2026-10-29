# Sojusan GameList browser extension

A browser extension for [Sojusan GameList](https://gamelist.sojusan.pl). It fills the **Title Import** page with the games you own or have on your wishlist on:

- Steam
- Epic Games
- GOG
- PlayStation
- Nintendo

You stay logged in to each store in your browser as usual. On the Title Import page you press a store's button, the extension reads your library and wishlist from that store, and the games appear in the text box, and those already known to GameList by their store id are imported without review. You then match them to the GameList catalogue as with any title import.

## How it works

```txt
GameList page  ──postMessage──▶  content script  ──▶  background script  ──fetch (your session)──▶  store
GameList page  ◀──postMessage──  content script  ◀──  background script  ◀──────── entries ─────────
```

- The extension **never talks to the GameList backend** and holds no GameList credentials. It only returns library entries (title, store id, wishlisted) to the page, and the page does the rest. See [ADR-0001](docs/adr/0001-extension-holds-no-backend-credentials.md).
- Reading a library is **always user-triggered**, one store per click. Owned and wishlisted games are merged and de-duplicated; Epic games are identified by their base-game offer, so add-ons and Unreal Engine marketplace assets are excluded.
- The message contract with the frontend is in [docs/frontend-contract.md](docs/frontend-contract.md), and the domain vocabulary is in [CONTEXT.md](CONTEXT.md).
- It works on `https://gamelist.sojusan.pl` and `http://localhost:5173` (for development) only.

The extension reads store pages through each store's own internal endpoints, which are not public APIs and can change without notice. If a store stops working after a store update, the adapter in `src/platforms/<store>/` needs a fix.

See the [privacy policy](docs/privacy-policy.md).

## Supported browsers

Chromium-based browsers (Chrome, Edge, Opera, Brave, …) and Firefox 142 or newer, both as Manifest V3.

## Development

Requirements: Node.js 22+ and [pnpm](https://pnpm.io) (the version is pinned in `package.json`).

```sh
pnpm install
pnpm build            # both browsers -> dist/chromium and dist/firefox
pnpm build:chromium   # only Chromium
pnpm build:firefox    # only Firefox
pnpm test             # Vitest
pnpm lint             # oxlint
pnpm typecheck        # tsc --noEmit
pnpm format           # oxfmt
```

### Load the unpacked build

- **Chromium browsers:** open `chrome://extensions` (or `opera://extensions`), enable **Developer mode**, click **Load unpacked** and select `dist/chromium`.
- **Firefox:** open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on** and select `dist/firefox/manifest.json`.

After changing the code, run `pnpm build` and press the extension's reload button.

To inspect the background script, use **service worker → Inspect** on the extension's card in Chromium, or **Inspect** in `about:debugging` in Firefox.

## Project layout

| Path                     | Purpose                                                                |
| ------------------------ | ---------------------------------------------------------------------- |
| `src/manifest.ts`        | Generates the per-browser manifest                                     |
| `src/content.ts`         | Content script injected on the GameList frontend; relays messages      |
| `src/bridge.ts`          | The page ↔ content script message handling                             |
| `src/background.ts`      | Receives sync requests and runs the platform adapters                  |
| `src/sync.ts`            | Runs one platform sync and de-duplicates the entries by store id       |
| `src/platforms/<store>/` | One adapter per store (`fetchTitles()`)                                |
| `src/popup/`             | The toolbar popup (Preact), with an EN/PL switch                       |
| `scripts/build.mjs`      | Builds popup, background and content script for each browser           |
| `scripts/package.mjs`    | Zips the builds for store upload                                       |
| `icons-src/icon.svg`     | Source of the icons in `public/icons/` (based on the frontend favicon) |

### Adding a store

1. Add the platform name to `PLATFORMS` in `src/contract.ts` and its host to `PLATFORM_HOST_PERMISSIONS` in `src/manifest.ts`.
1. Create `src/platforms/<store>/` with an adapter that returns entries and throws `NotLoggedInError` when the user has no session, with parsing tested against fixtures.
1. Register it in `src/platforms/index.ts`.
1. Add the button in the frontend (`PlatformSyncButtons.tsx` and the extension `contract.ts` there).

## Releasing

1. Bump `version` in `package.json` (stores reject a version they have already seen). The manifest version comes from it.
1. Run:

   ```sh
   pnpm package
   ```

   This builds both browsers and writes three files to `release/`:

   - `game-list-extension-chromium-<version>.zip`: upload to the Chrome Web Store
   - `game-list-extension-firefox-<version>.zip`: upload to Firefox Add-ons (AMO)
   - `game-list-extension-source-<version>.zip`: the source archive AMO reviewers ask for, because the extension is bundled

1. For the Firefox source upload, the build instructions are: _Node.js 22, `pnpm install --frozen-lockfile`, then `pnpm build:firefox`; the output is in `dist/firefox`._
1. Both stores require a privacy policy URL, which can be the published
   [privacy policy](https://github.com/SojusanApps/game-list-browser-extension/blob/master/docs/privacy-policy.md).
1. The icons are generated from `icons-src/icon.svg`; if the logo changes, regenerate the PNGs in `public/icons/` (16, 32, 48 and 128 px).
