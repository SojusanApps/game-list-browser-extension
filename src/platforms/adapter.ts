import type { Platform } from "../contract";

/** Thrown by an adapter when the user has no logged-in session on the platform. */
export class NotLoggedInError extends Error {
  constructor(platform: Platform) {
    super(`Not logged in to ${platform}`);
    this.name = "NotLoggedInError";
  }
}

/** Reads one Platform Library (owned and wishlisted games) and returns its raw titles. */
export interface PlatformAdapter {
  fetchTitles(): Promise<string[]>;
}

export type AdapterRegistry = Partial<Record<Platform, PlatformAdapter>>;
