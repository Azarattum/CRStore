import { extensionPath } from "@vlcn.io/crsqlite";
import SQLite from "bun:sqlite";
import { platform } from "os";

/**
 * @param {string} file
 * @param {{ binding?: string; extension?: string; }} paths
 * @returns {Promise<{ database: any, env: "bun" }>}
 */
export async function load(file, paths) {
  if (platform() === "darwin") {
    SQLite.setCustomSQLite(
      paths.binding || "/opt/homebrew/opt/sqlite/lib/libsqlite3.dylib",
    );
  }

  const database = new SQLite(file);
  database.run("PRAGMA journal_mode = wal");
  database.loadExtension(paths.extension || extensionPath);

  const prepare = database.prepare.bind(database);
  database.prepare = (...args) =>
    Object.assign(prepare(...args), { reader: true });

  return { database, env: "bun" };
}
