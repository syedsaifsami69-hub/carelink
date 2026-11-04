import { execSync } from "child_process";

// Apply migrations + reseed (seed clears its own rows) in the dedicated test database before the suite runs.
export default function setup() {
  const env = { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL || "postgresql://carelink:carelink_dev_only@localhost:5432/carelink_test", NODE_ENV: "test", SEED_PASSWORD: "test-password-123" };
  execSync("npx prisma migrate deploy", { env, stdio: "ignore" });
  execSync("node prisma/seed.js", { env, stdio: "ignore" });
}
