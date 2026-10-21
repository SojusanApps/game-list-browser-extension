// Packages the store uploads into `release/`: one zip per browser build, plus the source zip Firefox reviewers ask for.
import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { zipSync } from "fflate";

const root = fileURLToPath(new URL("..", import.meta.url));
const { version } = JSON.parse(await readFile(`${root}package.json`, "utf8"));
const outDir = `${root}release`;
await mkdir(outDir, { recursive: true });

async function listFiles(dir, prefix = "") {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...(await listFiles(join(dir, entry.name), path))); // NOSONAR
    else files.push(path);
  }
  return files;
}

async function zipFiles(baseDir, files, outFile) {
  const entries = {};
  for (const file of files) entries[file] = new Uint8Array(await readFile(join(baseDir, file))); // NOSONAR
  await writeFile(outFile, zipSync(entries));
  console.log(`wrote ${outFile}`);
}

for (const target of ["chromium", "firefox"]) {
  const dir = `${root}dist/${target}`;
  await zipFiles(dir, await listFiles(dir), `${outDir}/game-list-extension-${target}-${version}.zip`); // NOSONAR
}

// The committed tree (HEAD), so the source zip matches what the release was built from. Uncommitted changes are left out.
const sourceZip = `${outDir}/game-list-extension-source-${version}.zip`;
const archiveArgs = ["archive", "--format=zip", `--prefix=game-list-extension-${version}/`, "-o", sourceZip, "HEAD"];
execFileSync("git", archiveArgs, { cwd: root }); // NOSONAR
console.log(`wrote ${sourceZip}`);
