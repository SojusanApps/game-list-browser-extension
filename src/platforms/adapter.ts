import type { LibraryEntry, Platform } from "../contract";
import { SyncError } from "../errors";

/** Thrown by an adapter when the user has no logged-in session on the platform. */
export class NotLoggedInError extends Error {
  constructor(platform: Platform) {
    super(`Not logged in to ${platform}`);
    this.name = "NotLoggedInError";
  }
}

/** Reads one Platform Library (owned and wishlisted games) and returns its raw entries. */
export interface PlatformAdapter {
  fetchEntries(): Promise<LibraryEntry[]>;
}

/** Thrown when a non-empty library yields no entry with a usable store id, so the id field is probably wrong. */
export class MissingStoreIdError extends SyncError<"missingStoreId"> {
  constructor(platform: Platform, field: string) {
    super("missingStoreId", { platform, field });
    this.name = "MissingStoreIdError";
  }
}

export type AdapterRegistry = Partial<Record<Platform, PlatformAdapter>>;
