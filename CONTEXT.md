# Game List Browser Extension

A browser extension that lets a user pull the titles of games they own or wishlist on a store, so they can be imported into their game list by game-list-backend.

## Language

**Platform**:
A store the extension can read a user's games from: Steam, Epic, GOG, PlayStation or Nintendo.
_Avoid_: store, provider, site, service

**Platform Library**:
The games a user owns on a **Platform**, together with the games on their wishlist there. Each game is flagged as owned or wishlisted.
_Avoid_: collection, game list (that is the backend's `GameList`), account games

**Library Entry**:
One game in a **Platform Library**: its title, its **Store Id**, and whether it is wishlisted (not owned). A game that is both owned and wishlisted is one **Library Entry**, flagged as owned, never two. Two games sharing a title but with different **Store Ids** are two entries.
_Avoid_: item, record, title (a title is only one part of an entry)

**Store Id**:
The **Platform**'s own stable, public identifier of a game, always handed over as a string: Steam `appid`, GOG product id, Nintendo `nsUid`, Epic `offerId`, PlayStation `conceptId`. Lets the backend match a **Library Entry** without relying on its title. Every **Library Entry** has one; a game the extension cannot read an id for is skipped.
_Avoid_: appid, product id, external id (the backend's `ExternalGame.external_id` is the matching counterpart, not this)

**Platform Sync**:
The user-triggered act of reading one **Platform Library** from the user's logged-in session on that **Platform** and handing its **Library Entries** to the Title Import page. Always triggered per **Platform**, never automatically.
_Avoid_: import (that is the backend's **Title Import**), scrape, refresh

**Title Import**:
The backend's two-step flow for adding games to a user's `GameList` from a list of game titles. The extension only supplies the titles; matching, filtering of non-games, and review all belong to the backend and frontend.

## Relationships

- A **Platform Sync** reads exactly one **Platform Library** and produces a flat list of **Library Entries**, de-duplicated by **Store Id**.
- A **Platform Sync** does nothing but feed the **Title Import** page; it never talks to the backend.
