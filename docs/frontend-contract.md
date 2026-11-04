# Frontend ↔ extension contract (version 3)

The GameList frontend talks to the extension with `window.postMessage` on its own window. A content script injected on `https://gamelist.sojusan.pl` and `http://localhost:5173` relays requests to the background script, which runs the **Platform Sync**. The extension ignores messages not posted by the page itself. Types live in `src/contract.ts`; bump `CONTRACT_VERSION` on breaking changes.

## Detecting the extension

The extension posts `READY` when the page loads. A page that missed it (the content script runs at `document_start`, so this is rare) sends `PING` and waits ~1s; if there is no `READY`, treat the extension as not installed.

```ts
window.postMessage({ source: "gamelist-frontend", version: 3, type: "PING" }, window.location.origin);
// -> { source: "gamelist-extension", version: 3, type: "READY" }
```

## Running a Platform Sync

```ts
window.postMessage(
  { source: "gamelist-frontend", version: 3, type: "SYNC", requestId: "<unique id>", platform: "steam" },
  window.location.origin,
);
// -> { source: "gamelist-extension", version: 3, type: "SYNC_RESULT", requestId, result }
```

`platform` is one of `steam`, `epic`, `playstation`, `nintendo`, `gog`. Match the replies to the request by `requestId`.

## Following the progress of a sync

A sync of a large library can take minutes. A frontend that sends `version: 3` or later in its `SYNC` request is also sent `SYNC_PROGRESS` messages before the `SYNC_RESULT`; an older frontend is never sent them.

```ts
// -> { source: "gamelist-extension", version: 3, type: "SYNC_PROGRESS", requestId, progress }
```

`progress`:

| field      | meaning                                                                                                |
| ---------- | ------------------------------------------------------------------------------------------------------ |
| `platform` | the platform being synced                                                                              |
| `stage`    | `starting`, `collection` (reading owned games), `wishlist`, or `resolving` (looking up each game's id) |
| `done`     | items of the stage handled so far; only when the extension knows it                                    |
| `total`    | items of the stage in all; only when the extension knows it                                            |

- Show a determinate bar when `done` and `total` are set, otherwise an indeterminate one with the stage name. The stage is a code, not text: the frontend words and translates it.
- A platform sends only the stages it has, and a stage may have a `done` without a `total` (GOG and Epic know how many games they have read, not how many there are): show the count with an indeterminate bar. Every platform at least reports `collection` and `wishlist` as it moves through them, so a long sync keeps sending messages; `total` is set for PlayStation's `resolving`, Steam's `resolving` and, when the platform says so, for Nintendo and PlayStation's `collection`.
- Messages are sent at most about four times a second, newest first, so every message is also a sign of life: a frontend that gives up on a silent extension should count the silence from the last message, not from the request.
- Progress never replaces the result: a sync always ends with one `SYNC_RESULT`, including when it failed or was interrupted (`status: "error"`).

`result`:

| field      | meaning                                                                                 |
| ---------- | --------------------------------------------------------------------------------------- |
| `platform` | the requested platform                                                                  |
| `status`   | `ok`, `not_logged_in` or `error`                                                        |
| `entries`  | owned and wishlisted **Library Entries**, de-duplicated by `storeId`; empty unless `ok` |
| `count`    | `entries.length`                                                                        |
| `error`    | message, only when `status` is `error`                                                  |

Each entry is `{ storeId: string, title: string, wishlisted: boolean }`. `storeId` is the platform's own id of the game (Steam `appid`, GOG product id, Nintendo `nsUid`, Epic `offerId`, PlayStation `conceptId`), always a string. `wishlisted` is `true` only when the user does not own the game; a game both owned and wishlisted is one entry with `wishlisted: false`. Games the extension cannot read an id for are skipped; if a whole library has games but no ids, `status` is `error`.

The extension announces its contract version in `READY`, `SYNC_PROGRESS` and `SYNC_RESULT`. The frontend should treat a `READY` below version 2 as an outdated extension, since version 1 returned `titles` instead of `entries`. Version 3 only adds `SYNC_PROGRESS`, so a frontend that does not need progress works with version 2 and 3 alike.

On `not_logged_in` the frontend shows the "log in first" message with a link to the platform's login page. The extension's popup also shows each sync's status (see **Sync Status** in `CONTEXT.md`), but the frontend remains the place that explains a login problem.
