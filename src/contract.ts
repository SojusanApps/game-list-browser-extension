/** Message contract between the GameList frontend page and the extension. See docs/frontend-contract.md. */
export const CONTRACT_VERSION = 2;

export const PLATFORMS = ["steam", "epic", "playstation", "nintendo", "gog"] as const;
export type Platform = (typeof PLATFORMS)[number];

export type SyncStatus = "ok" | "not_logged_in" | "error";

/** One game of a Platform Library. */
export interface LibraryEntry {
  /** The Platform's own id of the game, always a string. */
  storeId: string;
  title: string;
  /** True when the game is only on the wishlist; false when the user owns it. */
  wishlisted: boolean;
}

/** Result of one Platform Sync. `entries` is empty unless `status` is `ok`. */
export interface SyncResult {
  platform: Platform;
  status: SyncStatus;
  entries: LibraryEntry[];
  count: number;
  /** Human-readable detail, only set when `status` is `error`. */
  error?: string;
}

export interface FrontendPing {
  source: "gamelist-frontend";
  version: number;
  type: "PING";
}

export interface FrontendSync {
  source: "gamelist-frontend";
  version: number;
  type: "SYNC";
  requestId: string;
  platform: Platform;
}

export type FrontendMessage = FrontendPing | FrontendSync;

export interface ExtensionReady {
  source: "gamelist-extension";
  version: number;
  type: "READY";
}

export interface ExtensionSyncResult {
  source: "gamelist-extension";
  version: number;
  type: "SYNC_RESULT";
  requestId: string;
  result: SyncResult;
}

export type ExtensionMessage = ExtensionReady | ExtensionSyncResult;

/** Message from the content script to the background script. */
export interface BackgroundSyncRequest {
  type: "SYNC";
  platform: Platform;
}

export function isPlatform(value: unknown): value is Platform {
  return typeof value === "string" && (PLATFORMS as readonly string[]).includes(value);
}

/** Narrows an untrusted `window.postMessage` payload to a well-formed frontend message. */
export function parseFrontendMessage(data: unknown): FrontendMessage | null {
  if (typeof data !== "object" || data === null) return null;
  const message = data as Record<string, unknown>;
  if (message.source !== "gamelist-frontend" || typeof message.version !== "number") return null;
  if (message.type === "PING") return { source: "gamelist-frontend", version: message.version, type: "PING" };
  if (message.type === "SYNC" && typeof message.requestId === "string" && isPlatform(message.platform)) {
    return {
      source: "gamelist-frontend",
      version: message.version,
      type: "SYNC",
      requestId: message.requestId,
      platform: message.platform,
    };
  }
  return null;
}
