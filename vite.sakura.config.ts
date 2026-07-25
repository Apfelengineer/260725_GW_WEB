/** さくらインターネットへ静的配信する2画面を生成するVite設定です。 */

import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: "sakura",
  base: "./",
  publicDir: "../public",
  plugins: [react()],
  build: {
    // メイン画面と試験室空き状況画面を、それぞれ独立したHTML入口として出力します。
    outDir: "../dist-sakura",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(projectRoot, "sakura/index.html"),
        reservations: resolve(projectRoot, "sakura/reservations.html"),
      },
    },
  },
});
