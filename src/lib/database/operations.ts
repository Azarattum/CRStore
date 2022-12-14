import type {
  TableExpressionNode,
  FilterOperator,
  CompiledQuery,
  JoinNode,
  Kysely,
} from "kysely";
import type { Operation } from "../types";
import type { CRChange } from "./schema";
import { sql } from "kysely";

function toBytes(data: string) {
  return Uint8Array.from([...data].map((x) => x.charCodeAt(0)));
}

function fromBytes(data: Uint8Array) {
  return String.fromCharCode(...data);
}

function encode(changes: CRChange[]) {
  return changes.flatMap((x) => [
    String.fromCharCode(...x.site_id),
    x.cid,
    x.pk,
    x.table,
    x.val,
    x.version,
  ]);
}

function decode(encoded: any[]) {
  const changes: CRChange[] = [];
  for (let i = 0; i < encoded.length; i += 6) {
    changes.push({
      site_id: Uint8Array.from([...encoded[i]].map((x) => x.charCodeAt(0))),
      cid: encoded[i + 1],
      pk: encoded[i + 2],
      table: encoded[i + 3],
      val: encoded[i + 4],
      version: encoded[i + 5],
    });
  }
  return changes;
}

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
    execute: () => query.execute(this).then((x) => fromBytes(x.rows[0].client)),
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
    // Don't return tombstones when requesting the entire db
    .if(!since, (qb) => qb.where("cid", "!=", "__crsql_del"))
    .if(client != null, (qb) =>
      qb.where("site_id", operator, toBytes(client || ""))
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
        const version = await selectVersion.bind(db)().execute();
        await operation(db, ...args).execute();
        return await changesSince.bind(db)(version).execute();
      });
    },
  };
}

function affectedTables(target: Partial<CompiledQuery> | any[]) {
  if (Array.isArray(target)) {
    const tables = new Set<string>();
    for (let i = 3; i < target.length; i += 6) tables.add(target[i]);
    return [...tables];
  }

  const toTables = (x: readonly (TableExpressionNode | JoinNode)[]) =>
    x
      .filter((x) => x.kind === "TableNode")
      .map((x: any) => x.table.identifier.name as string);

  const { query } = target;
  if (!query) return [];

  if (query.kind === "SelectQueryNode" || query.kind === "DeleteQueryNode") {
    return toTables([...query.from.froms, ...(query.joins || [])]);
  } else if (query.kind === "InsertQueryNode") {
    const selects: string[] =
      query.values?.kind === "SelectQueryNode"
        ? affectedTables({ query: query.values })
        : [];

    return [query.into.table.identifier.name, ...selects];
  } else if (query.kind === "UpdateQueryNode") {
    if (query.table.kind === "AliasNode") return [];
    return [
      query.table.table.identifier.name,
      ...toTables(query.from?.froms || []),
    ];
  }

  return [];
}

export {
  selectClient,
  selectVersion,
  changesSince,
  insertChanges,
  applyOperation,
  resolveChanges,
  affectedTables,
};