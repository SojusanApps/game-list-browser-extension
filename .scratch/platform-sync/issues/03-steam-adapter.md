Status: resolved
Blocked by: 02

# Steam adapter

Owned + wishlist titles. Pure parse function with recorded fixtures; not_logged_in detection.

## Answer

src/platforms/steam/: adapter (index.ts) + pure parsers (parse.ts) + fixtures/tests. Flow: GET store.steampowered.com/dynamicstore/userdata/ with credentials include -> rgOwnedApps + rgWishlist app ids (merged, de-duped). That endpoint returns ids only, so names are resolved via api.steampowered.com/IStoreBrowseService/GetItems/v1 (public, no key, 200 ids per request; checked live). Empty owned+wishlist => NotLoggedInError. Added https://api.steampowered.com/* to host permissions. No title filtering (DLC/tools included).
