# The extension holds no backend credentials

The extension never calls game-list-backend. A **Platform Sync** reads titles from the user's logged-in session on a **Platform** and passes them to the frontend's Title Import page, which owns authentication (Keycloak) and the candidate review step. We chose this over having the extension call `title-import` itself because the backend's Title Import is a two-step flow that needs human review (the frontend already has that UI), and because it keeps tokens out of the extension and removes any backend host permission or CORS surface.

## Consequences

- The extension is only usable together with the frontend page; there is no standalone sync.
- The frontend ↔ extension message contract is the extension's public API and must be versioned.
