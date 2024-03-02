import SQLite from "better-sqlite3";
import { extensionPath } from "@vlcn.io/crsqlite";

/**
 * @param {string} file
 * @param {{ binding?: string; extension?: string; }} paths
 * @returns {Promise<{ database: any, env: "node" }>}
 */
export async function load(file, paths) {
  const database = new SQLite(file, { nativeBinding: paths.binding });
  database.pragma("journal_mode = WAL");
  database.loadExtension(paths.extension || extensionPath);
  return { database, env: "node" };
}
