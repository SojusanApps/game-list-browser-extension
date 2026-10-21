import { describe, expect, it } from "vitest";

import storeItems from "./fixtures/store-items.json";
import loggedOut from "./fixtures/userdata-logged-out.json";
import userdata from "./fixtures/userdata.json";
import { parseStoreItems, parseUserData } from "./parse";

describe("parseUserData", () => {
  it("merges owned and wishlisted app ids, de-duplicated, ignoring non-numeric entries", () => {
    expect(parseUserData(userdata)).toEqual([620, 730, 1145360]);
  });

  it("returns nothing for a logged-out session", () => {
    expect(parseUserData(loggedOut)).toEqual([]);
  });

  it("returns nothing for malformed payloads", () => {
    expect(parseUserData(null)).toEqual([]);
    expect(parseUserData({ rgOwnedApps: "x" })).toEqual([]);
  });
});

describe("parseStoreItems", () => {
  it("returns appid/name pairs and skips unresolved or unnamed items", () => {
    expect(parseStoreItems(storeItems)).toEqual([
      [620, "Portal 2"],
      [730, "Counter-Strike 2"],
      [1145360, "Hades"],
    ]);
  });

  it("returns nothing for malformed payloads", () => {
    expect(parseStoreItems({})).toEqual([]);
    expect(parseStoreItems(undefined)).toEqual([]);
  });
});
