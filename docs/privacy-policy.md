# Privacy Policy: Sojusan GameList browser extension

> Last updated: 2026-10-21

The Sojusan GameList browser extension ("the extension") fills the Title Import page of [Sojusan GameList](https://gamelist.sojusan.pl) with the titles of games you own or wishlist on Steam, Epic Games, GOG, PlayStation and Nintendo.

## What the extension does with your data

- **Only when you click a platform button.** The extension reads nothing until you press a store button on the GameList Title Import page.
- **It uses your existing login.** It requests your game library and wishlist from that store's own website using the session you are already logged in with in your browser. It never sees, asks for, or stores your store password.
- **It reads game titles only.** It extracts the names of the games in your library and wishlist. It does not read payment details, personal profile data, friends lists or messages.
- **The titles go to the GameList page you are on.** They are handed to the open GameList page (gamelist.sojusan.pl, or localhost during development) in your browser, which puts them in the title box for you to review. The extension itself makes no requests to the GameList server and holds no GameList credentials.

## What the extension stores

- A language preference for the extension popup (English or Polish).
- A cached identifier the Nintendo integration needs to query Nintendo's wishlist, so it does not have to be looked up every time.

Both are kept locally in your browser through the browser's extension storage. They contain no personal data.

## What the extension does not do

- It does not collect, sell, share or transmit your data to the developer or any third party.
- It does not use analytics, advertising or tracking of any kind.
- It does not run in the background on its own or read pages you browse.

## Permissions

| Permission                                                       | Why it is needed                                                                                                                 |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Access to Steam, Epic Games, GOG, PlayStation and Nintendo sites | To request your own library and wishlist from the store you are logged in to.                                                    |
| Access to the GameList site                                      | To receive your button click and give back the titles.                                                                           |
| `scripting`                                                      | The Nintendo integration briefly opens its own store pages in a background tab to read the page configuration, then closes them. |
| `storage`                                                        | To remember the popup language and the Nintendo configuration cache.                                                             |

## Contact

Questions or concerns: open an issue at <https://github.com/SojusanApps/game-list-browser-extension/issues>.

## Changes

If this policy changes, the date above will be updated and the new version published at the same address.
