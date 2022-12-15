/**
 * This has to be a '.js' file, so that TypeScript
 *   doesn't strip out the `@vite-ignore` comment!
 */

/**
 * Load database runtime based on the environment
 * @param {string} file
 * @param {{ binding: string | undefined; extension: string; wasm: string; }} paths
 */
export async function load(file, paths) {
  if (globalThis.process) {
    // @ts-ignore
    const bun = !!process.isBun;
    const bunSqlite = "bun:sqlite";
    const { default: SQLite } = bun
      ? // @ts-ignore
        await import(/* @vite-ignore */ bunSqlite)
      : await import("better-sqlite3");

    const database = new SQLite(file, { nativeBinding: paths.binding });
    if (bun) database.run("PRAGMA journal_mode = wal");
    else database.pragma("journal_mode = WAL");

    database.loadExtension(paths.extension);
    return { database, browser: false };
  } else {
    await import("navigator.locks");
    const { default: load } = await import("@vlcn.io/wa-crsqlite");
    const sqlite = await load(() => paths.wasm);
    const database = await sqlite.open(file);
    return { database, browser: true };
  }
}
