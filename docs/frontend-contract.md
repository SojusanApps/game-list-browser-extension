# Frontend ↔ extension contract (version 1)

The GameList frontend talks to the extension with `window.postMessage` on its own window. A content script injected on `https://gamelist.sojusan.pl` and `http://localhost:5173` relays requests to the background script, which runs the **Platform Sync**. The extension ignores messages not posted by the page itself. Types live in `src/contract.ts`; bump `CONTRACT_VERSION` on breaking changes.

## Detecting the extension

The extension posts `READY` when the page loads. A page that missed it (the content script runs at `document_start`, so this is rare) sends `PING` and waits ~1s; if there is no `READY`, treat the extension as not installed.

```ts
window.postMessage({ source: "gamelist-frontend", version: 1, type: "PING" }, window.location.origin);
// -> { source: "gamelist-extension", version: 1, type: "READY" }
```

## Running a Platform Sync

```ts
window.postMessage(
  { source: "gamelist-frontend", version: 1, type: "SYNC", requestId: "<unique id>", platform: "steam" },
  window.location.origin,
);
// -> { source: "gamelist-extension", version: 1, type: "SYNC_RESULT", requestId, result }
```

`platform` is one of `steam`, `epic`, `playstation`, `nintendo`, `gog`. Match the reply to the request by `requestId`.

`result`:

| field      | meaning                                                                   |
| ---------- | ------------------------------------------------------------------------- |
| `platform` | the requested platform                                                    |
| `status`   | `ok`, `not_logged_in` or `error`                                          |
| `titles`   | owned and wishlisted titles, trimmed and de-duplicated; empty unless `ok` |
| `count`    | `titles.length`                                                           |
| `error`    | message, only when `status` is `error`                                    |

On `not_logged_in` the frontend shows the "log in first" message with a link to the platform's login page. The extension shows no UI of its own.
