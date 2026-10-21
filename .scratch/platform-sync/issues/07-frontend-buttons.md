Status: resolved
Blocked by: 02

# Frontend: per-platform fill buttons on Title Import page (game-list-frontend)

Implement in game-list-frontend, not this repo. One button per platform; detect extension (ping with timeout, else disabled + install link); append titles one per line de-duplicated against textarea; show not_logged_in message with platform login link; show error status.

## Answer

Implemented on game-list-frontend branch feature/browser-extension (uncommitted): src/features/games/extension/{contract,extensionClient}.ts, components/import/PlatformSyncButtons.tsx wired into TitleImportFlow step 0, appendTitles in utils/titleImport.ts, en/pl locale keys (games:import.platformSync.*), tests/features/games/extensionClient.test.ts. Lint, typecheck, tests (206) and build pass.
