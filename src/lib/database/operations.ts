import type { Operation, Node, Change, EncodedChanges } from "../types";
import type { Kysely } from "kysely";
import { sql } from "kysely";

function toBytes(data: string) {
  return Uint8Array.from([...data].map((x) => x.charCodeAt(0)));
}

function fromBytes(data: Uint8Array) {
  return String.fromCharCode(...data);
}

function encode(changes: Change[]): EncodedChanges {
  if (!changes.length) return [];
  return [
    fromBytes(changes[0].site_id),
    ...changes.flatMap((x) => [
      x.cid,
      fromBytes(x.pk),
      x.table,
      x.val,
      x.db_version,
      x.col_version,
      x.cl,
      x.seq,
    ]),
  ];
}

function decode(encoded: EncodedChanges) {
  if (!encoded[0]) return [];
  const client = toBytes(encoded[0]);
  const changes: Change[] = [];
  for (let i = 1; i < encoded.length; i += 8) {
    changes.push({
      site_id: client,
      cid: encoded[i] as string,
      pk: toBytes(encoded[i + 1] as string) as Uint8Array,
      table: encoded[i + 2] as string,
      val: encoded[i + 3] as string | null,
      db_version: encoded[i + 4] as number,
      col_version: encoded[i + 5] as number,
      cl: encoded[i + 6] as number,
      seq: encoded[i + 7] as number,
    });
  }
  return changes;
}

function selectVersion(this: Kysely<any>) {
  type Version = { current: number; synced: number };
  const query = sql<Version>`SELECT 
    crsql_db_version() as current,
    IFNULL(MAX(version), 0) as synced
  FROM "__crstore_sync"`;

  return {
    execute: () => query.execute(this).then((x) => x.rows[0]),
  };
}

function updateVersion(this: Kysely<any>, version?: number) {
  return this.updateTable("__crstore_sync").set({
    version: version != null ? version : sql`crsql_db_version()`,
  });
}

function selectClient(this: Kysely<any>) {
  type Client = { client: Uint8Array };
  const query = sql<Client>`SELECT crsql_site_id() as client`;
  return {
    execute: () => query.execute(this).then((x) => fromBytes(x.rows[0].client)),
  };
}

function changesSince(
  this: Kysely<any>,
  since: number,
  filter?: string | null
) {
  let query = this.selectFrom("crsql_changes")
    // Overwrite `site_id` with the local one
    .select(sql`crsql_site_id()`.as("site_id"))
    .select([
      "cid",
      "pk",
      "table",
      "val",
      "db_version",
      "col_version",
      "cl",
      "seq",
    ])
    .where("db_version", ">", since)
    // Don't return tombstones when requesting the entire db
    .$if(!since, (qb) => qb.where("cid", "!=", "__crsql_del"))
    .$if(filter === null, (qb) =>
      qb.where("site_id", "is", sql`crsql_site_id()`)
    )
    .$if(typeof filter === "string", (qb) =>
      qb.where("site_id", "is not", toBytes(filter as any))
    )
    .$castTo<Change>();

  return {
    execute: () => query.execute().then(encode),
  };
}

function insertChanges(this: Kysely<any>, changes: EncodedChanges) {
  const run = async (db: typeof this) => {
    if (!changes.length) return;
    await db.insertInto("crsql_changes").values(decode(changes)).execute();
    await updateVersion.bind(db)().execute();
  };
  return {
    execute: () =>
      this.isTransaction ? run(this) : this.transaction().execute(run),
  };
}

function resolveChanges(this: Kysely<any>, changes: EncodedChanges) {
  return {
    execute: () =>
      applyOperation
        .bind(this)((db) => insertChanges.bind(db)(changes).execute())
        .execute()
        .then((x) => x.changes),
  };
}

function applyOperation<T extends any[], R>(
  this: Kysely<any>,
  operation: Operation<T, R>,
  ...args: T
) {
  return {
    execute: () =>
      this.transaction().execute(async (db) => {
        const { current } = await selectVersion.bind(db)().execute();
        const result = await operation(db, ...args);
        const changes = await changesSince.bind(db)(current).execute();
        return { result, changes };
      }),
  };
}

function finalize(this: Kysely<any>) {
  const query = sql`select crsql_finalize();`;
  return {
    execute: () => query.execute(this),
  };
}

function affectedTables(target: Node | EncodedChanges): string[] {
  if (Array.isArray(target)) {
    const tables = new Set<string>();
    for (let i = 3; i < target.length; i += 8) tables.add(target[i] as string);
    return [...tables];
  }
  if (target.kind === "TableNode") {
    return [target.table.identifier.name];
  }
  if (target.kind === "ReferenceNode" && target.table) {
    return [target.table.table.identifier.name];
  }
  if (target.kind === "AliasNode") {
    return affectedTables(target.node as Node);
  }
  if (target.kind === "SelectQueryNode") {
    const tables = (
      [
        ...(target.from?.froms || []),
        ...(target.joins?.map((x) => x.table) || []),
        ...(target.selections?.map((x) => x.selection) || []),
        ...(target.with?.expressions.map((x) => x.expression) || []),
      ] as Node[]
    ).flatMap(affectedTables);
    return [...new Set(tables)];
  }
  return [];
}

export {
  encode,
  decode,
  finalize,
  changesSince,
  selectClient,
  selectVersion,
  updateVersion,
  insertChanges,
  applyOperation,
  resolveChanges,
  affectedTables,
};
