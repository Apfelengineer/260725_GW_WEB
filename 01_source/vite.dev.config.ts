/** 開発中にスケジューラーと空き状況の2画面を同時確認するVite設定です。 */

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
    outDir: "../.dev-build",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(projectRoot, "sakura/index.html"),
        reservations: resolve(projectRoot, "sakura/reservations.html"),
      },
    },
  },
});
