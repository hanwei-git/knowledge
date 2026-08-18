import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import path from "node:path";
import { defineConfig } from "vitest/config";

const migrations = await readD1Migrations(path.join(__dirname, "migrations"));

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: { TEST_MIGRATIONS: migrations }
      }
    })
  ],
  test: {
    include: ["src/**/*.workers.test.ts"],
    setupFiles: ["./test/applyMigrations.ts"]
  }
});
