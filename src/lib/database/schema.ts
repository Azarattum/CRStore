import { sql, type Transaction } from "kysely";

function covert(type: string) {
  const types = {
    any: "blob",
    string: "text",
    number: "real",
    unknown: "blob",
    instance: "blob",
    bigint: "integer",
    integer: "integer",
    boolean: "boolean",
  } as const;

  const mapped = types[type as keyof typeof types];
  if (mapped) return mapped;
  throw new Error(`Type "${type}" is not allowed in the database schema!`);
}

async function apply(db: Transaction<any>, { schema }: CRSchema) {
  for (const table in schema) {
    const current = schema[table];
    // Create tables
    let query = db.schema.createTable(table).ifNotExists();
    for (const column in current.schema) {
      const { type } = current.schema[column];
      query = query.addColumn(
        column,
        current.ordered?.find(([x]) => x === column) ? "blob" : covert(type),
        (col) =>
          current.primary?.includes(column) ? col.primaryKey().notNull() : col
      );
    }
    await query.execute();
    // Create indices
    for (const index of current.indices || []) {
      await db.schema
        .createIndex(`${table}_${index.join("_")}`)
        .ifNotExists()
        .on(table)
        .columns(index)
        .execute();
    }
    // Register CRRs
    if (current.crr) {
      await sql`SELECT crsql_as_crr(${table})`.execute(db);
    }
    // Register fraction index
    for (const ordered of current.ordered || []) {
      await sql`SELECT crsql_fract_as_ordered(${table},${sql.join(
        ordered
      )})`.execute(db);
    }
    // Create a special table for version sync
    await db.schema
      .createTable("__crstore_sync")
      .ifNotExists()
      .addColumn("version", "integer")
      .execute();
    await sql`INSERT INTO __crstore_sync (version) SELECT 0
      WHERE NOT EXISTS (SELECT * FROM __crstore_sync)
    `.execute(db);
  }
}

function primary<T extends CRTable>(table: T, ...keys: Keys<T["schema"]>[]) {
  table.primary = keys;
  return table;
}

function crr<T extends CRTable>(table: T) {
  table.crr = true;
  return table;
}

function ordered<T extends CRTable>(
  table: T,
  by: Keys<T["schema"]>,
  ...grouped: Keys<T["schema"]>[]
) {
  if (!table.ordered) table.ordered = [];
  table.ordered.push([by, ...grouped]);
  return table;
}

function index<T extends CRTable>(table: T, ...keys: Keys<T["schema"]>[]) {
  if (!table.indices) table.indices = [];
  table.indices.push(keys);
  return table;
}

type Keys<T> = Exclude<keyof T, number | symbol>;
type CRColumn = { type: string };
type CRTable = {
  schema: Record<string, CRColumn>;

  ordered?: string[][];
  indices?: string[][];
  primary?: string[];
  crr?: boolean;
};
type CRSchema = { schema: Record<string, CRTable> };

export { apply, primary, crr, index, ordered };
export type { CRSchema };
