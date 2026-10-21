Status: resolved
Blocked by: 02

# Nintendo adapter

Collection + wishlist titles incl. query hash / client id discovery. Fixtures; not_logged_in detection.

## Answer

Implemented in `src/platforms/nintendo/` (registered in `src/platforms/index.ts`), flow:

- `core.ts` — `createNintendoAdapter(deps)`: wishlist (session at `ec.nintendo.com/api/auth/session`, persisted-query GET against the Savanna GraphQL endpoint) then collection (POST `getVgcsVgcs`, visible + hidden). Returns raw titles, collection first; no filtering (DLC-only views are NOT excluded).
- `parse.ts` — pure parsing (client id / idToken / query-hash extraction, session helpers, error classification, page parsing); `fixtures/` + `parse.test.ts`, `adapter.test.ts` (fake fetch/inspector/storage).
- `tabs.ts` — `PageInspector`: opens a background tab and polls it via `browser.scripting.executeScript`.
- `index.ts` — real wiring (webextension-polyfill, `storage.local` cache for query hash + client id).

Manifest: added `permissions: ["scripting", "storage"]` (existing `*.nintendo.com` host permission covers the tabs).

Login detection: collection tab redirected away from `accounts.nintendo.com/portal/vgcs`, shop tab redirected off `ec.nintendo.com`, shop session that cannot be refreshed within ~15s, or HTTP 401/403 / auth-looking GraphQL errors → `NotLoggedInError`.

Caveats:

- Fixtures are not recorded from live Nintendo responses. The wishlist title field is assumed to be `itemV2.name` — verify against a real response.
- A logged-out user waits up to ~15s on the shop-session path before `not_logged_in`.
- Sync briefly opens (and closes) background tabs on `accounts.nintendo.com` and `ec.nintendo.com`.
