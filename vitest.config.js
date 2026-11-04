import { defineConfig } from "vitest/config";

const TEST_DB = "postgresql://carelink:carelink_dev_only@localhost:5432/carelink_test";
export default defineConfig({
  test: {
    include: ["test/**/*.test.js"],
    globalSetup: "./test/global-setup.js",
    env: { DATABASE_URL: process.env.TEST_DATABASE_URL || TEST_DB, NODE_ENV: "test", SEED_PASSWORD: "test-password-123" },
    fileParallelism: false,
    testTimeout: 20000,
  },
});
