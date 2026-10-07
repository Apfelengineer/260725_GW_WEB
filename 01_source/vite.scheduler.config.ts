/** OriginサーバーのScheduler配下へ置く画面だけを生成します。 */
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: "origin/Scheduler",
  base: "./",
  publicDir: false,
  plugins: [react()],
  build: {
    outDir: "../../../02_release/origin/Scheduler",
    emptyOutDir: true,
    rollupOptions: { input: { main: resolve(projectRoot, "origin/Scheduler/index.html") } },
  },
});
