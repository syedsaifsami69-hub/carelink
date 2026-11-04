import { createServer } from "http";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { createApp } from "./app.js";
import { attachRealtime } from "./realtime.js";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env (see README).");
  process.exit(1);
}

const db = new PrismaClient();
const storageDir = path.resolve(process.env.STORAGE_DIR || "./storage");
let realtime;
const app = createApp(db, { notify: (v) => realtime.notify(v), storageDir });
const server = createServer(app);
realtime = attachRealtime(server, db);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`CareLink server → http://localhost:${PORT}`));

const shutdown = () => {
  realtime.close();
  server.close(() => db.$disconnect().then(() => process.exit(0)));
  setTimeout(() => process.exit(1), 10e3).unref();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
