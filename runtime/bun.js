import { extensionPath } from "@vlcn.io/crsqlite";
import { platform } from "os";

let isSQLiteUnchanged = true;

/**
 * @param {string} file
 * @param {{ binding?: string; extension?: string; }} paths
 * @returns {Promise<{ database: any, env: "bun" }>}
 */
export async function load(file, paths) {
  const { Database: SQLite } = await import("bun:sqlite");
  if (platform() === "darwin") {
    paths.binding ??= "/opt/homebrew/opt/sqlite/lib/libsqlite3.dylib";
  }

  if (paths.binding && isSQLiteUnchanged) {
    SQLite.setCustomSQLite(paths.binding);
    isSQLiteUnchanged = false;
  }

  const database = new SQLite(file);
  database.run("PRAGMA journal_mode = wal");
  database.loadExtension(paths.extension || extensionPath);

  const prepare = database.prepare.bind(database);
  database.prepare = (...args) =>
    Object.assign(prepare(...args), { reader: true });

  return { database, env: "bun" };
}
