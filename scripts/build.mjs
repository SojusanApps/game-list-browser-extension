import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import preact from "@preact/preset-vite";
import { build } from "vite";

import { buildManifest } from "../src/manifest.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const targets = process.argv[2] ? [process.argv[2]] : ["chromium", "firefox"];
const { version } = JSON.parse(await readFile(`${root}package.json`, "utf8"));

// Each script is built on its own: content scripts cannot be ES modules or share chunks.
const scripts = [
  { name: "background", format: "es" },
  { name: "content", format: "iife" },
];

const common = { root, configFile: false, logLevel: "warn" };

function buildPopup(outDir) {
  return build({
    ...common,
    plugins: [preact()],
    build: { outDir, emptyOutDir: true, rollupOptions: { input: { popup: `${root}popup.html` } } },
  });
}

function buildScript(outDir, { name, format }) {
  return build({
    ...common,
    build: {
      outDir,
      emptyOutDir: false,
      lib: { entry: `${root}src/${name}.ts`, formats: [format], name, fileName: () => `${name}.js` },
    },
  });
}

for (const target of targets) {
  const outDir = `${root}dist/${target}`;

  // Sequential on purpose: the popup build empties outDir, and the script builds write into it.
  await buildPopup(outDir); // NOSONAR
  for (const script of scripts) {
    await buildScript(outDir, script); // NOSONAR
  }

  await mkdir(outDir, { recursive: true }); // NOSONAR
  await writeFile(`${outDir}/manifest.json`, JSON.stringify(buildManifest(target, version), null, 2)); // NOSONAR
  console.log(`built ${target} -> dist/${target}`);
}
