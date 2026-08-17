/** 内部サーバーへ配布するスケジューラー画面だけを生成します。 */
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: "sakura",
  base: "./",
  publicDir: false,
  plugins: [react()],
  build: {
    outDir: "../dist-internal",
    emptyOutDir: true,
    rollupOptions: { input: { main: resolve(projectRoot, "sakura/index.html") } },
  },
});
