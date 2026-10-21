import { describe, expect, it } from "vitest";

import { NotLoggedInError } from "./platforms/adapter";
import { dedupeTitles, runSync } from "./sync";

describe("dedupeTitles", () => {
  it("trims, drops blanks and keeps first-seen order", () => {
    expect(dedupeTitles([" Hades ", "Hades", "", "  ", "Celeste"])).toEqual(["Hades", "Celeste"]);
  });
});

describe("runSync", () => {
  it("returns de-duplicated titles with a count", async () => {
    const result = await runSync("steam", { steam: { fetchTitles: async () => ["A", "A", "B"] } });
    expect(result).toEqual({ platform: "steam", status: "ok", titles: ["A", "B"], count: 2 });
  });

  it("maps NotLoggedInError to not_logged_in", async () => {
    const result = await runSync("epic", {
      epic: {
        fetchTitles: async () => {
          throw new NotLoggedInError("epic");
        },
      },
    });
    expect(result).toEqual({ platform: "epic", status: "not_logged_in", titles: [], count: 0 });
  });

  it("maps other failures to error with a message", async () => {
    const result = await runSync("nintendo", {
      nintendo: {
        fetchTitles: async () => {
          throw new Error("boom");
        },
      },
    });
    expect(result).toMatchObject({ status: "error", error: "boom", titles: [], count: 0 });
  });

  it("reports an unregistered platform as an error", async () => {
    expect(await runSync("playstation", {})).toMatchObject({ status: "error" });
  });
});
