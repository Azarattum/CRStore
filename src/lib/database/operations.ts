import type { Operation, Node } from "../types";
import type { CRChange } from "./schema";
import type { Kysely } from "kysely";
import { sql } from "kysely";

function toBytes(data: string) {
  return Uint8Array.from([...data].map((x) => x.charCodeAt(0)));
}

function fromBytes(data: Uint8Array) {
  return String.fromCharCode(...data);
}

function encode(changes: CRChange[]) {
  if (!changes.length) return [];
  return [
    fromBytes(changes[0].site_id),
    ...changes.flatMap((x) => [
      x.cid,
      x.pk,
      x.table,
      x.val,
      x.db_version,
      x.col_version,
    ]),
  ];
}

function decode(encoded: any[]) {
  const client = toBytes(encoded[0]);
  const changes: CRChange[] = [];
  for (let i = 1; i < encoded.length; i += 6) {
    changes.push({
      site_id: client,
      cid: encoded[i],
      pk: encoded[i + 1],
      table: encoded[i + 2],
      val: encoded[i + 3],
      db_version: encoded[i + 4],
      col_version: encoded[i + 5],
    });
  }
  return changes;
}

function selectVersion(this: Kysely<any>) {
  type Version = { current: number; synced: number };
  const query = sql<Version>`SELECT 
    crsql_dbversion() as current,
    IFNULL(MAX(version), 0) as synced
  FROM "crsql_tracked_peers"`;

  return {
    execute: () => query.execute(this).then((x) => x.rows[0]),
  };
}

function updateVersion(this: Kysely<any>, version?: number) {
  return this.updateTable("crsql_tracked_peers").set({
    version: version != null ? version : sql`crsql_dbversion()`,
  });
}

function selectClient(this: Kysely<any>) {
  type Client = { client: Uint8Array };
  const query = sql<Client>`SELECT crsql_siteid() as client`;
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
    .select(sql`crsql_siteid()`.as("site_id"))
    .select(["cid", "pk", "table", "val", "db_version", "col_version"])
    .where("db_version", ">", since)
    // Don't return tombstones when requesting the entire db
    .$if(!since, (qb) => qb.where("cid", "!=", "__crsql_del"))
    .$if(filter === null, (qb) => qb.where("site_id", "is", null))
    .$if(typeof filter === "string", (qb) =>
      qb.where("site_id", "!=", toBytes(filter as any))
    );

  return {
    execute: () => query.execute().then(encode as any),
  };
}

function insertChanges(this: Kysely<any>, changes: any[]) {
  const query = this.insertInto("crsql_changes").values(decode(changes));

  return {
    async execute() {
      if (!changes.length) return;
      await query.execute();
    },
  };
}

function resolveChanges(this: Kysely<any>, changes: any[]) {
  return applyOperation.bind(this)((db) => insertChanges.bind(db)(changes));
}

function applyOperation<T extends any[]>(
  this: Kysely<any>,
  operation: Operation<T>,
  ...args: T
) {
  return {
    execute: async () => {
      return this.transaction().execute(async (db) => {
        const { current } = await selectVersion.bind(db)().execute();
        let result = operation(db, ...args);
        if (!isExecutable(result)) result = await result;
        if (isExecutable(result)) await result.execute();
        return await changesSince.bind(db)(current).execute();
      });
    },
  };
}

function finalize(this: Kysely<any>) {
  const query = sql`select crsql_finalize();`;
  return {
    execute: () => query.execute(this),
  };
}

function affectedTables(target: Node | any[]): string[] {
  if (Array.isArray(target)) {
    const tables = new Set<string>();
    for (let i = 3; i < target.length; i += 6) tables.add(target[i]);
    return [...tables];
  }
  if (target.kind === "TableNode") {
    return [target.table.identifier.name];
  }
  if (target.kind === "ReferenceNode") {
    return [target.table.table.identifier.name];
  }
  if (target.kind === "AliasNode") {
    return affectedTables(target.node as Node);
  }
  if (target.kind === "SelectQueryNode") {
    const tables = (
      [
        ...target.from.froms,
        ...(target.joins?.map((x) => x.table) || []),
        ...(target.selections?.map((x) => x.selection) || []),
      ] as Node[]
    ).flatMap(affectedTables);
    return [...new Set(tables)];
  }
  return [];
}

function isExecutable(data: any): data is { execute: () => any } {
  return (
    data &&
    typeof data === "object" &&
    "execute" in data &&
    typeof data["execute"] === "function"
  );
}

export {
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
