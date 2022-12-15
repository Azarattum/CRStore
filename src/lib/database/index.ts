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
import { load } from "./load";

const connections = new Map();
const defaultPaths = {
  wasm: "/sqlite.wasm",
  extension: "node_modules/@vlcn.io/crsqlite/build/Release/crsqlite.node",
  binding: undefined as string | undefined,
};

async function init<T extends CRSchema>(
  file: string,
  schema: T,
  paths = defaultPaths
) {
  if (connections.has(file)) return connections.get(file) as typeof connection;

  const { database, browser } = await load(file, paths);
  const Dialect = browser ? CRDialect : SqliteDialect;
  const kysely = new Kysely<Schema<T>>({ dialect: new Dialect({ database }) });
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

export { init, defaultPaths };
