import { apply, encode, decode, type CRChange, type CRSchema } from "./schema";
import { Kysely, sql, SqliteDialect } from "kysely";
import type { Struct, Infer } from "superstruct";
import { CRDialect } from "./dialect";

const connections = new Map();

async function createProvider<T>(file: string) {
  /// TODO: custom wasm/ext path
  if (globalThis.process) {
    const bun = !!(process as any).isBun;
    const bunSqlite: string = "bun:sqlite";
    const { default: SQLite } = bun
      ? await import(/* @vite-ignore */ bunSqlite)
      : await import("better-sqlite3");

    const database = new SQLite(file);
    if (bun) database.run("PRAGMA journal_mode = wal");
    else database.pragma("journal_mode = WAL");

    database.loadExtension(
      "node_modules/@vlcn.io/crsqlite/build/Release/crsqlite.node"
    );
    return new Kysely<T>({ dialect: new SqliteDialect({ database }) });
  } else {
    const { default: load } = await import("@vlcn.io/wa-crsqlite");
    const sqlite = load(() => "/wa-sqlite-async.wasm");
    const database = await (await sqlite).open(file);
    return new Kysely<T>({ dialect: new CRDialect({ database }) });
  }
}

async function init<T extends CRSchema>(file: string, schema: T) {
  if (connections.has(file)) return connections.get(file) as typeof connection;
  type Schema = T extends Struct<any> ? Infer<T> : unknown;

  const kysely = await createProvider<Schema>(file);
  const close = kysely.destroy.bind(kysely);
  await apply(kysely, schema);

  function selectVersion() {
    type Version = { version: number };
    const query = sql<Version>`SELECT crsql_dbversion() as version`;
    return {
      execute: () => query.execute(kysely).then((x) => x.rows[0].version),
    };
  }

  function selectClient() {
    type Client = { client: Uint8Array };
    const query = sql<Client>`SELECT crsql_siteid() as client`;
    return {
      execute: () =>
        query.execute(kysely).then((x) => encode(x.rows[0].client)),
    };
  }

  function changesSince(since?: number, filter?: string) {
    return {
      async execute() {
        since = since != null ? since : await selectVersion().execute();
        let query = kysely
          .selectFrom("crsql_changes" as any)
          .selectAll()
          .where("version" as any, ">", since);
        if (filter) query = query.where("site_id" as any, "!=", decode(filter));
        return (await query.execute()) as CRChange[];
      },
    };
  }

  function insertChanges(changes: CRChange[]) {
    const query = kysely
      .insertInto("crsql_changes" as any)
      .values(changes as any);

    return {
      async execute() {
        if (!changes.length) return [];
        const version = await selectVersion().execute();
        await query.execute();
        return changesSince(version).execute();
      },
    };
  }

  async function destroy() {
    await close();
    connections.delete(file);
  }

  const connection = Object.assign(kysely, {
    insertChanges,
    selectVersion,
    selectClient,
    changesSince,
    destroy,
  });

  connections.set(file, connection);
  return connection;
}

export { init, encode, decode };
