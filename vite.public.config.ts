/** 外部サーバーへ配布する試験室空き状況画面だけを生成します。 */
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
    outDir: "../dist-public",
    emptyOutDir: true,
    rollupOptions: { input: { reservations: resolve(projectRoot, "sakura/reservations.html") } },
  },
});
