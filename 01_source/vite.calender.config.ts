/** OriginサーバーのCalender配下へ置く試験室空き状況画面だけを生成します。 */
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: "origin/Calender",
  base: "./",
  publicDir: false,
  plugins: [react()],
  build: {
    outDir: "../../../02_release/origin/Calender",
    emptyOutDir: true,
    rollupOptions: { input: { main: resolve(projectRoot, "origin/Calender/index.html") } },
  },
});
