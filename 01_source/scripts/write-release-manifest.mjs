/** 02_release内の配布ファイル一覧とSHA-256を再生成します。 */
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const sourceRoot = fileURLToPath(new URL("../", import.meta.url));
const releaseRoot = resolve(sourceRoot, "../02_release");
const targets = ["origin", "tamanegi", "renkon"];

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

const files = [];
for (const target of targets) files.push(...await listFiles(resolve(releaseRoot, target)));
files.sort((left, right) => left.localeCompare(right, "en"));

const lines = [];
for (const file of files) {
  const digest = createHash("sha256").update(await readFile(file)).digest("hex");
  const path = relative(releaseRoot, file).split(sep).join("/");
  lines.push(`${digest}  ${path}`);
}

await writeFile(resolve(releaseRoot, "SHA256SUMS"), `${lines.join("\n")}\n`, "utf8");
