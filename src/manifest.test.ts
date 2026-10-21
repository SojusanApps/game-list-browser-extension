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
});
