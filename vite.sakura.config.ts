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
