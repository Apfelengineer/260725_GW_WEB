/** ビルド先へ用途別の許可ファイルだけをコピーし、内部情報の混入を防ぎます。 */
import { copyFile, mkdir, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const target = process.argv[2];
const distributions = {
  origin: {
    directory: "origin",
    files: [
      "public/api.php",
      "public/runtime-config.php",
      "public/auth.php",
      "public/portal-access.php",
      "public/scheduler-entry.php",
      "public/availability-contract.php",
      "public/availability-room-config.php",
      "public/availability-json.php",
      "public/availability-publisher.php",
      "public/publish-availability-cli.php",
      "public/monitor-availability-cli.php",
      "public/manage-auth-user-cli.php",
      "public/og.png",
    ],
  },
  tamanegi: {
    directory: "tamanegi",
    files: [
      "public/runtime-config.php",
      "public/availability-contract.php",
      "public/receive-availability.php",
      "public/public-availability.php",
      "public/health-availability.php",
      "public/technology-center-logo-white.png",
      "public/m6.png",
      "public/m7.png",
      "public/m8.png",
    ],
  },
  renkon: {
    directory: "renkon",
    clean: true,
    files: [
      "renkon/index.html",
      "renkon/styles.css",
      "renkon/config.js",
      "renkon/app.js",
      "renkon/renkon-config.php",
      "renkon/open-scheduler.php",
    ],
  },
};

if (!(target in distributions)) throw new Error("origin、tamanegi または renkon を指定してください");
const distribution = distributions[target];
const destination = resolve(root, "../02_release", distribution.directory);
if (distribution.clean) await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
for (const source of distribution.files) await copyFile(resolve(root, source), resolve(destination, source.split("/").at(-1)));

// originはPHP入口でトークンを検証してから画面を返すため、生成HTMLをindex.phpへ連結します。
if (target === "origin") {
  const generatedHtml = resolve(destination, "index.html");
  const entryTemplate = resolve(destination, "scheduler-entry.php");
  const [php, html] = await Promise.all([readFile(entryTemplate, "utf8"), readFile(generatedHtml, "utf8")]);
  await writeFile(resolve(destination, "index.php"), `${php}${html}`, "utf8");
  await unlink(generatedHtml);
  await unlink(entryTemplate);
}

// tamanegi側はディレクトリURLだけで表示できるようindex.htmlへ統一します。
if (target === "tamanegi") {
  const generatedHtml = resolve(destination, "reservations.html");
  await copyFile(generatedHtml, resolve(destination, "index.html"));
  await unlink(generatedHtml);
}
