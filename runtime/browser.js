import "navigator.locks";

import wasmUrl from "@vlcn.io/wa-crsqlite/wa-sqlite-async.wasm?url";
import wasmSqlite from "@vlcn.io/wa-crsqlite";

/**
 * @param {string} file
 * @param {{ wasm: string | undefined; }} paths
 * @returns {Promise<{ database:any, browser:boolean }>}
 */
export async function load(file, paths) {
  const sqlite = await wasmSqlite(() => paths.wasm || wasmUrl);
  const database = await sqlite.open(file);
  return { database, browser: true };
}
