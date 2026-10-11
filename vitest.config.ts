import { defineConfig } from "vitest/config";
import path from "path";

const templateRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  root: templateRoot,
  resolve: {
    alias: {
      "@": path.resolve(templateRoot, "client", "src"),
      "@shared": path.resolve(templateRoot, "shared"),
      "@server": path.resolve(templateRoot, "server"),
      "@assets": path.resolve(templateRoot, "attached_assets"),
    },
  },
  test: {
    environment: "node",
    // Tests run as a fictional owner: production names the Super Admin in the hosting environment, never in code.
    env: { OWNER_ADMIN_EMAIL: "owner@example.test" },
    // Every test lives under test/, mirroring client/src, server and shared.
    include: ["test/**/*.test.ts", "test/**/*.test.tsx", "test/**/*.spec.ts", "test/**/*.spec.tsx"],
  },
});
