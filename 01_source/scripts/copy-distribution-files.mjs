/** ビルド先へ用途別の許可ファイルだけをコピーし、内部情報の混入を防ぎます。 */
import { copyFile, mkdir, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const target = process.argv[2];
const distributions = {
  scheduler: {
    directory: "origin/Scheduler",
    files: [
      "origin/shared/public/api.php",
      "origin/shared/public/runtime-config.php",
      "origin/shared/public/auth.php",
      "origin/shared/public/portal-access.php",
      "origin/shared/public/scheduler-entry.php",
      "origin/shared/public/availability-contract.php",
      "origin/shared/public/availability-room-config.php",
      "origin/shared/public/availability-json.php",
      "origin/shared/public/availability-publisher.php",
      "origin/shared/public/publish-availability-cli.php",
      "origin/shared/public/monitor-availability-cli.php",
      "origin/shared/public/manage-auth-user-cli.php",
      "origin/shared/public/scheduler-backup.php",
      "origin/shared/public/backup-scheduler-cli.php",
      "origin/shared/public/restore-scheduler-cli.php",
      "origin/shared/public/og.png",
    ],
  },
  calendar: {
    directory: "origin/Calendar",
    files: [
      "origin/shared/public/runtime-config.php",
      "origin/shared/public/availability-contract.php",
      "origin/shared/public/receive-availability.php",
      "origin/shared/public/public-availability.php",
      "origin/shared/public/health-availability.php",
      "origin/shared/public/technology-center-logo-white.png",
      "origin/shared/public/m6.png",
      "origin/shared/public/m7.png",
      "origin/shared/public/m8.png",
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

if (!(target in distributions)) throw new Error("scheduler、calendar または renkon を指定してください");
const distribution = distributions[target];
const destination = resolve(root, "../02_release", distribution.directory);
if (distribution.clean) await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
for (const source of distribution.files) await copyFile(resolve(root, source), resolve(destination, source.split("/").at(-1)));

// SchedulerはPHP入口でトークンを検証してから画面を返すため、生成HTMLをindex.phpへ連結します。
if (target === "scheduler") {
  const generatedHtml = resolve(destination, "index.html");
  const entryTemplate = resolve(destination, "scheduler-entry.php");
  const [php, html] = await Promise.all([readFile(entryTemplate, "utf8"), readFile(generatedHtml, "utf8")]);
  await writeFile(resolve(destination, "index.php"), `${php}${html}`, "utf8");
  await unlink(generatedHtml);
  await unlink(entryTemplate);
}
