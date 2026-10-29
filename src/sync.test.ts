import { describe, expect, it } from "vitest";

import type { LibraryEntry } from "./contract";
import { SyncError } from "./errors";
import { NotLoggedInError } from "./platforms/adapter";
import { dedupeEntries, runSync } from "./sync";

const owned = (storeId: string, title: string): LibraryEntry => ({ storeId, title, wishlisted: false });
const wished = (storeId: string, title: string): LibraryEntry => ({ storeId, title, wishlisted: true });

describe("dedupeEntries", () => {
  it("trims, drops entries without a title or store id and keeps first-seen order", () => {
    expect(
      dedupeEntries([owned(" 1 ", " Hades "), owned("2", "  "), owned(" ", "No id"), owned("3", "Celeste")]),
    ).toEqual([owned("1", "Hades"), owned("3", "Celeste")]);
  });

  it("keeps one entry per store id, with owned winning over wishlisted", () => {
    expect(
      dedupeEntries([wished("1", "Hades"), owned("1", "Hades"), owned("2", "Hades"), wished("2", "Hades")]),
    ).toEqual([owned("1", "Hades"), owned("2", "Hades")]);
  });

  it("keeps different store ids that share a title", () => {
    expect(dedupeEntries([owned("1", "Doom"), owned("2", "Doom")])).toHaveLength(2);
  });
});

describe("runSync", () => {
  it("returns de-duplicated entries with a count", async () => {
    const result = await runSync("steam", {
      steam: { fetchEntries: async () => [owned("1", "A"), owned("1", "A"), owned("2", "B")] },
    });
    expect(result).toEqual({ platform: "steam", status: "ok", entries: [owned("1", "A"), owned("2", "B")], count: 2 });
  });

  it("maps NotLoggedInError to not_logged_in", async () => {
    const result = await runSync("epic", {
      epic: {
        fetchEntries: async () => {
          throw new NotLoggedInError("epic");
        },
      },
    });
    expect(result).toEqual({ platform: "epic", status: "not_logged_in", entries: [], count: 0 });
  });

  it("maps other failures to error with a message", async () => {
    const result = await runSync("nintendo", {
      nintendo: {
        fetchEntries: async () => {
          throw new Error("boom");
        },
      },
    });
    expect(result).toMatchObject({ status: "error", error: "Unexpected error: boom", entries: [], count: 0 });
  });

  it("renders error messages in the chosen language", async () => {
    const adapters = {
      epic: {
        fetchEntries: async () => {
          throw new SyncError("requestFailed", { platform: "epic", step: "wishlist", status: 500 });
        },
      },
    };
    expect(await runSync("epic", adapters, "pl")).toMatchObject({
      error: "Żądanie do Epic (lista życzeń) nie powiodło się (HTTP 500)",
    });
    expect(await runSync("epic", adapters, "en")).toMatchObject({
      error: "Epic wishlist request failed (HTTP 500)",
    });
    expect(await runSync("steam", {}, "pl")).toMatchObject({ error: "Steam nie jest jeszcze obsługiwany" });
  });

  it("reports an unregistered platform as an error", async () => {
    expect(await runSync("playstation", {})).toMatchObject({ status: "error" });
  });
});
