import { CompiledQuery, Kysely, sql, SqliteDialect } from "kysely";
import type { CRChange, CRSchema, Encoded } from "./schema";
import { apply, encode, decode } from "./schema";
import type { FilterOperator } from "kysely";
import type { Schema } from "../types";
import { CRDialect } from "./dialect";

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

  function selectVersion(this: Kysely<any>) {
    type Version = { version: number };
    const query = sql<Version>`SELECT crsql_dbversion() as version`;
    return {
      execute: () => query.execute(this).then((x) => x.rows[0].version),
    };
  }

  function selectClient(this: Kysely<any>) {
    type Client = { client: Uint8Array };
    const query = sql<Client>`SELECT crsql_siteid() as client`;
    return {
      execute: () => query.execute(this).then((x) => encode(x.rows[0].client)),
    };
  }

  function changesSince(
    this: Kysely<any>,
    since: number,
    operator: FilterOperator = "!=",
    client?: string
  ) {
    let query = this.selectFrom("crsql_changes")
      .selectAll()
      .where("version", ">", since)
      .if(client != null, (qb) =>
        qb.where("site_id", operator, decode(client || ""))
      );

    return {
      execute: async () =>
        (await query.execute()).map((x) => encode(x as CRChange)),
    };
  }

  function insertChanges(this: Kysely<any>, changes: Encoded<CRChange>[]) {
    const decoded = changes.map((x) => decode(x, "site_id"));
    const query = this.insertInto("crsql_changes").values(decoded);

    return {
      async execute() {
        if (!changes.length) return;
        await query.execute();
      },
    };
  }

  function resolveChanges(changes: Encoded<CRChange>[]) {
    return {
      async execute() {
        if (!changes.length) return [];
        return kysely.transaction().execute(async (db) => {
          const version = await selectVersion.bind(db)().execute();
          await insertChanges.bind(db)(changes).execute();
          return await changesSince.bind(db)(version).execute();
        });
      },
    };
  }

  async function destroy() {
    await close();
    connections.delete(file);
  }

  const connection = Object.assign(kysely, {
    resolveChanges,
    insertChanges,
    selectVersion,
    selectClient,
    changesSince,
    destroy,
  });

  connections.set(file, connection);
  return connection;
}

function affectedTables({ query }: CompiledQuery) {
  if (query.kind === "SelectQueryNode" || query.kind === "DeleteQueryNode") {
    return query.from.froms
      .filter((x) => x.kind === "TableNode")
      .map((x: any) => x.table.identifier.name as string);
  } else if (query.kind === "InsertQueryNode") {
    return [query.into.table.identifier.name];
  } else if (query.kind === "UpdateQueryNode") {
    if (query.table.kind === "AliasNode") return [];
    return [query.table.table.identifier.name];
  }

  return [];
}

export { init, updatePaths, affectedTables };
