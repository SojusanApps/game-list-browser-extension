Status: resolved
Blocked by: 02

# PlayStation adapter

Collection + wishlist titles. Fixtures; not_logged_in detection.

## Answer

Implemented in `src/platforms/playstation/` (`parse.ts` pure parsers, `adapter.ts`, `fixtures.ts`, `playstation.test.ts`; registered in `src/platforms/index.ts`). Fetches `library.playstation.com/recently-purchased` (paginated via `?page=N`, max 50) and `/wishlist` with `credentials: 'include'`, `redirect: 'manual'`, and reads titles from `__NEXT_DATA__` Apollo state. Not logged in = redirect, `/signin` redirect, cross-origin network `TypeError`, missing `__NEXT_DATA__`, or no `session.userData.accountId`. No manifest change needed (`*.playstation.com` already allowed).

Caveat: the `name` field on purchased games / wishlist entries (and `__ref` resolution) is assumed, and fixtures are hand-built. Verify against a live session.
