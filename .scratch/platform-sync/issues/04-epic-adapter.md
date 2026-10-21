Status: resolved
Blocked by: 02

# Epic adapter

Library + wishlist titles incl. token flow. Fixtures; not_logged_in detection.

## Answer

Implemented in `src/platforms/epic/`: `parse.ts` (pure parsers), `adapter.ts` (`createEpicAdapter`, injectable `fetch` and store warmup), `index.ts` (browser wiring, registered in `src/platforms/index.ts`), fixtures and tests.

Flow: `GET id/api/redirect` with session cookies for an authorization code (none means `NotLoggedInError`), exchange it at the OAuth token endpoint, page through `library/api/public/items`, resolve titles via the catalog bulk endpoint, then query the store `getWishlist` GraphQL persisted query. If the wishlist reports `notLoggedIn`, a background store tab is opened once and the request retried. No filtering; the dispatcher de-dupes.

Caveats: the library records contain ids only, so titles come from the catalog bulk endpoint (`catalog-public-service-prod06`). That call and the wishlist title path (`offer.title`) are not verified against live Epic, and the fixtures are hand-built from the consumed shapes. Verify manually with a logged-in account. No manifest change was needed (`*.epicgames.com` is already covered).
