/** ビルド先へ用途別の許可ファイルだけをコピーし、内部情報の混入を防ぎます。 */
import { copyFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const target = process.argv[2];
const distributions = {
  internal: {
    directory: "dist-internal",
    files: [
      "public/api.php",
      "public/runtime-config.php",
      "public/auth.php",
      "public/availability-contract.php",
      "public/availability-json.php",
      "public/availability-publisher.php",
      "public/publish-availability-cli.php",
      "public/monitor-availability-cli.php",
      "public/manage-auth-user-cli.php",
      "public/og.png",
    ],
  },
  public: {
    directory: "dist-public",
    files: [
      "public/runtime-config.php",
      "public/availability-contract.php",
      "public/receive-availability.php",
      "public/public-availability.php",
      "public/health-availability.php",
      "public/technology-center-logo-white.png",
    ],
  },
};

if (!(target in distributions)) throw new Error("internal または public を指定してください");
const distribution = distributions[target];
const destination = resolve(root, distribution.directory);
await mkdir(destination, { recursive: true });
for (const source of distribution.files) await copyFile(resolve(root, source), resolve(destination, source.split("/").at(-1)));
