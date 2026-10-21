# Game List Browser Extension

A browser extension that lets a user pull the titles of games they own or wishlist on a store, so they can be imported into their game list by game-list-backend.

## Language

**Platform**:
A store the extension can read a user's games from: Steam, Epic, GOG, PlayStation or Nintendo.
_Avoid_: store, provider, site, service

**Platform Library**:
The games a user owns on a **Platform**, together with the games on their wishlist there. Owned and wishlisted games are not distinguished.
_Avoid_: collection, game list (that is the backend's `GameList`), account games

**Platform Sync**:
The user-triggered act of reading one **Platform Library** from the user's logged-in session on that **Platform** and handing its titles to the Title Import page. Always triggered per **Platform**, never automatically.
_Avoid_: import (that is the backend's **Title Import**), scrape, refresh

**Title Import**:
The backend's two-step flow for adding games to a user's `GameList` from a list of game titles. The extension only supplies the titles; matching, filtering of non-games, and review all belong to the backend and frontend.

## Relationships

- A **Platform Sync** reads exactly one **Platform Library** and produces a flat list of title strings.
- A **Platform Sync** does nothing but feed the **Title Import** page; it never talks to the backend.
