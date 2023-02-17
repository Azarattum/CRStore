import * as nodeSqlite from "better-sqlite3";
import { extensionPath } from "@vlcn.io/crsqlite";

/**
 * @param {string} file
 * @param {{ binding: string | undefined; extension: string | undefined; }} paths
 * @returns {Promise<{ database:any, browser:boolean }>}
 */
export async function load(file, paths) {
  // @ts-ignore
  const bun = !!process.isBun;
  const bunSqlite = "bun:sqlite";
  const { default: SQLite } = bun
    ? // @ts-ignore
      await import(/* @vite-ignore */ bunSqlite)
    : nodeSqlite;

  const options = !bun ? { nativeBinding: paths.binding } : undefined;
  const database = new SQLite(file, options);
  if (bun) database.run("PRAGMA journal_mode = wal");
  else database.pragma("journal_mode = WAL");

  database.loadExtension(paths.extension || extensionPath);
  return { database, browser: false };
}
