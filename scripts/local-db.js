// Local Postgres without Docker/WSL (dev and tests only). Keeps running until Ctrl+C.
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "fs";

const dir = "./.pgdata";
const pg = new EmbeddedPostgres({
  databaseDir: dir, user: "carelink", password: "carelink_dev_only", port: 5432, persistent: true,
});
if (!existsSync(dir)) await pg.initialise();
await pg.start();
for (const name of ["carelink", "carelink_test"]) {
  try { await pg.createDatabase(name); } catch { /* already exists */ }
}
console.log("Local Postgres ready on localhost:5432 (databases: carelink, carelink_test)");
const stop = async () => { await pg.stop(); process.exit(0); };
process.on("SIGINT", stop); process.on("SIGTERM", stop);
