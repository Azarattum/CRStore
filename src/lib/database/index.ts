import {
  resolveChanges,
  insertChanges,
  selectVersion,
  changesSince,
  selectClient,
  applyOperation,
  finalize,
} from "./operations";
import { Kysely, SqliteDialect } from "kysely";
import type { CRSchema } from "./schema";
import type { Schema } from "../types";
import { CRDialect } from "./dialect";
import { apply } from "./schema";

const connections = new Map();
const paths = {
  wasm: "/sqlite.wasm",
  extension: "node_modules/@vlcn.io/crsqlite/build/Release/crsqlite.node",
  binding: undefined as string | undefined,
};

function updatePaths(value: Partial<typeof paths>) {
  Object.assign(paths, value);
}

async function createProvider<T>(file: string) {
  if (globalThis.process) {
    const bun = !!(process as any).isBun;
    const bunSqlite: string = "bun:sqlite";
    const { default: SQLite } = bun
      ? await import(/* @vite-ignore */ bunSqlite)
      : await import("better-sqlite3");

    const database = new SQLite(file, { nativeBinding: paths.binding });
    if (bun) database.run("PRAGMA journal_mode = wal");
    else database.pragma("journal_mode = WAL");

    database.loadExtension(paths.extension);
    return new Kysely<T>({ dialect: new SqliteDialect({ database }) });
  } else {
    await import("navigator.locks");
    const { default: load } = await import("@vlcn.io/wa-crsqlite");
    const sqlite = load(() => paths.wasm);
    const database = await (await sqlite).open(file);
    return new Kysely<T>({ dialect: new CRDialect({ database }) });
  }
}

async function init<T extends CRSchema>(file: string, schema: T) {
  if (connections.has(file)) return connections.get(file) as typeof connection;

  const kysely = await createProvider<Schema<T>>(file);
  const close = kysely.destroy.bind(kysely);
  await apply(kysely, schema);

  const connection = Object.assign(kysely, {
    resolveChanges,
    applyOperation,
    insertChanges,
    selectVersion,
    selectClient,
    changesSince,
    async destroy() {
      connections.delete(file);
      await finalize.bind(kysely)().execute();
      return close();
    },
  });

  connections.set(file, connection);
  return connection;
}

export { init, updatePaths };
