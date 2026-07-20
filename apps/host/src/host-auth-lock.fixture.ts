import { Database } from "bun:sqlite";

const [, , databasePath] = process.argv;
if (!databasePath) {
  throw new Error("host-auth lock fixture requires a database path");
}

const database = new Database(databasePath, { strict: true });
database.exec("BEGIN IMMEDIATE");
console.log("locked");

setTimeout(() => {
  database.exec("COMMIT");
  database.close(true);
}, 150);
