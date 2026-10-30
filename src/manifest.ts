export type Browser = "chromium" | "firefox";

/**
 * Origins of the game-list frontend; the only pages the bridge content script runs on.
 * No ports: Firefox never matches a pattern with a port (Chrome ignores it), so the dev server is matched on any port.
 */
export const FRONTEND_MATCHES = ["https://gamelist.sojusan.pl/*", "http://localhost/*"];

/** Platform hosts the background script fetches from with the user's session cookies. Refined per adapter. */
export const PLATFORM_HOST_PERMISSIONS = [
  "https://store.steampowered.com/*",
  "https://steamcommunity.com/*",
  "https://api.steampowered.com/*",
  "https://*.epicgames.com/*",
  "https://*.playstation.com/*",
  "https://*.sony.com/*",
  "https://*.nintendo.com/*",
  "https://*.nintendo.net/*",
  "https://*.gog.com/*",
];

const ICONS = {
  "16": "icons/icon-16.png",
  "32": "icons/icon-32.png",
  "48": "icons/icon-48.png",
  "128": "icons/icon-128.png",
};

export function buildManifest(browser: Browser, version: string): Record<string, unknown> {
  const manifest: Record<string, unknown> = {
    manifest_version: 3,
    // Strings live in public/_locales/<lang>/messages.json (en is the default, pl is translated).
    default_locale: "en",
    name: "__MSG_extName__",
    version,
    description: "__MSG_extDescription__",
    icons: ICONS,
    action: { default_popup: "popup.html", default_title: "__MSG_extName__", default_icon: ICONS },
    // nintendo adapter: `scripting` reads page state from background discovery tabs, `storage` caches the query hash.
    permissions: ["scripting", "storage"],
    host_permissions: PLATFORM_HOST_PERMISSIONS,
    content_scripts: [{ matches: FRONTEND_MATCHES, js: ["content.js"], run_at: "document_start" }],
  };

  if (browser === "firefox") {
    manifest.background = { scripts: ["background.js"], type: "module" };
    manifest.browser_specific_settings = {
      gecko: {
        id: "extension@gamelist.sojusan.pl",
        strict_min_version: "142.0",
        // Required by AMO. The extension sends nothing to the developer or third parties (see docs/privacy-policy.md).
        data_collection_permissions: { required: ["none"] },
      },
    };
  } else {
    manifest.background = { service_worker: "background.js", type: "module" };
  }

  return manifest;
}
