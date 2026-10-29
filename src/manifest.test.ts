import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { buildManifest, FRONTEND_MATCHES } from "./manifest";

describe("buildManifest", () => {
  it("uses a service worker on chromium", () => {
    const manifest = buildManifest("chromium", "1.0.0");
    expect(manifest.background).toEqual({ service_worker: "background.js", type: "module" });
    expect(manifest.browser_specific_settings).toBeUndefined();
  });

  it("uses background scripts and a gecko id on firefox", () => {
    const manifest = buildManifest("firefox", "1.0.0");
    expect(manifest.background).toEqual({ scripts: ["background.js"], type: "module" });
    expect(manifest.browser_specific_settings).toBeDefined();
  });

  it("declares that the firefox build collects no data, as AMO requires", () => {
    const manifest = buildManifest("firefox", "1.0.0");
    expect(manifest.browser_specific_settings).toMatchObject({
      gecko: { data_collection_permissions: { required: ["none"] } },
    });
  });

  it("runs the content script only on the frontend origins", () => {
    const manifest = buildManifest("chromium", "1.0.0");
    expect(manifest.content_scripts).toEqual([
      { matches: FRONTEND_MATCHES, js: ["content.js"], run_at: "document_start" },
    ]);
  });

  it("uses no ports in the frontend match patterns, which Firefox cannot match", () => {
    for (const pattern of FRONTEND_MATCHES) expect(pattern).not.toMatch(/:\d+/);
  });

  it("does not request broad host access", () => {
    const hosts = buildManifest("chromium", "1.0.0").host_permissions as string[];
    expect(hosts).not.toContain("https://*/*");
    expect(hosts).not.toContain("<all_urls>");
  });

  it("localises the name and description from _locales, with en as the default", () => {
    const manifest = buildManifest("chromium", "1.0.0");
    expect(manifest.default_locale).toBe("en");
    expect(manifest.name).toBe("__MSG_extName__");
    expect(manifest.description).toBe("__MSG_extDescription__");
  });

  it.each(["en", "pl"])("keeps the %s description within the Chrome Web Store limit", locale => {
    const messages = JSON.parse(readFileSync(`public/_locales/${locale}/messages.json`, "utf8"));
    expect(messages.extName.message.length).toBeLessThanOrEqual(75);
    expect(messages.extDescription.message.length).toBeLessThanOrEqual(132);
  });
});
