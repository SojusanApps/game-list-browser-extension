/** Message contract between the GameList frontend page and the extension. See docs/frontend-contract.md. */
export const CONTRACT_VERSION = 3;
/** First contract version whose frontends understand `SYNC_PROGRESS`; older ones are never sent it. */
export const PROGRESS_CONTRACT_VERSION = 3;

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

/** What a Platform Sync is busy with. Platforms report only the stages they have. */
export const PROGRESS_STAGES = ["starting", "collection", "wishlist", "resolving"] as const;
export type ProgressStage = (typeof PROGRESS_STAGES)[number];

/** Progress of a running Platform Sync. `done` and `total` count the stage's items and are set only when known. */
export interface SyncProgress {
  platform: Platform;
  stage: ProgressStage;
  done?: number;
  total?: number;
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

/** Sent zero or more times before `SYNC_RESULT`, only to frontends speaking `PROGRESS_CONTRACT_VERSION` or later. */
export interface ExtensionSyncProgress {
  source: "gamelist-extension";
  version: number;
  type: "SYNC_PROGRESS";
  requestId: string;
  progress: SyncProgress;
}

export type ExtensionMessage = ExtensionReady | ExtensionSyncResult | ExtensionSyncProgress;

/** Name of the port a content script opens to run one Platform Sync in the background script. */
export const SYNC_PORT = "gamelist-sync";

/** First message on a sync port, from the content script to the background script. */
export interface BackgroundSyncRequest {
  type: "SYNC";
  platform: Platform;
}

/** Messages back on a sync port: any number of `PROGRESS`, then one `RESULT`. */
export type BackgroundSyncReply = { type: "PROGRESS"; progress: SyncProgress } | { type: "RESULT"; result: SyncResult };

/** Message from the popup asking the background script to forget a finished Platform Sync's status. */
export interface BackgroundDismissRequest {
  type: "DISMISS";
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
