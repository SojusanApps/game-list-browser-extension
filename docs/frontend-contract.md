# Frontend ↔ extension contract (version 2)

The GameList frontend talks to the extension with `window.postMessage` on its own window. A content script injected on `https://gamelist.sojusan.pl` and `http://localhost:5173` relays requests to the background script, which runs the **Platform Sync**. The extension ignores messages not posted by the page itself. Types live in `src/contract.ts`; bump `CONTRACT_VERSION` on breaking changes.

## Detecting the extension

The extension posts `READY` when the page loads. A page that missed it (the content script runs at `document_start`, so this is rare) sends `PING` and waits ~1s; if there is no `READY`, treat the extension as not installed.

```ts
window.postMessage({ source: "gamelist-frontend", version: 2, type: "PING" }, window.location.origin);
// -> { source: "gamelist-extension", version: 2, type: "READY" }
```

## Running a Platform Sync

```ts
window.postMessage(
  { source: "gamelist-frontend", version: 2, type: "SYNC", requestId: "<unique id>", platform: "steam" },
  window.location.origin,
);
// -> { source: "gamelist-extension", version: 2, type: "SYNC_RESULT", requestId, result }
```

`platform` is one of `steam`, `epic`, `playstation`, `nintendo`, `gog`. Match the reply to the request by `requestId`.

`result`:

| field      | meaning                                                                                 |
| ---------- | --------------------------------------------------------------------------------------- |
| `platform` | the requested platform                                                                  |
| `status`   | `ok`, `not_logged_in` or `error`                                                        |
| `entries`  | owned and wishlisted **Library Entries**, de-duplicated by `storeId`; empty unless `ok` |
| `count`    | `entries.length`                                                                        |
| `error`    | message, only when `status` is `error`                                                  |

Each entry is `{ storeId: string, title: string, wishlisted: boolean }`. `storeId` is the platform's own id of the game (Steam `appid`, GOG product id, Nintendo `nsUid`, Epic `offerId`, PlayStation `conceptId`), always a string. `wishlisted` is `true` only when the user does not own the game; a game both owned and wishlisted is one entry with `wishlisted: false`. Games the extension cannot read an id for are skipped; if a whole library has games but no ids, `status` is `error`.

The extension announces its contract version in `READY` and `SYNC_RESULT`. The frontend should treat a `READY` below version 2 as an outdated extension, since version 1 returned `titles` instead of `entries`.

On `not_logged_in` the frontend shows the "log in first" message with a link to the platform's login page. The extension shows no UI of its own.
