import path from "node:path";
import { defineConfig, mergeConfig } from "vite";
import site from "./vite.config";

/**
 * The public pages' build-time render (client/src/entry-server.tsx, R70): the same plugins and aliases as the site, so
 * the HTML written at build time is the HTML the browser's code would draw. Read by scripts/prerender.ts; not served.
 */
export default mergeConfig(site, defineConfig({
  build: {
    ssr: path.resolve(import.meta.dirname, "client/src/entry-server.tsx"),
    outDir: path.resolve(import.meta.dirname, "dist/ssr"),
    emptyOutDir: true,
    copyPublicDir: false,
    manifest: false,
  },
}));
