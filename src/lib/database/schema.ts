import { sql, type Kysely } from "kysely";

function covert(type: string) {
  const types = {
    string: "text",
    number: "real",
    instance: "blob",
    bigint: "integer",
    integer: "integer",
    boolean: "boolean",
  } as const;

  const mapped = types[type as keyof typeof types];
  if (mapped) return mapped;
  throw new Error(`Type "${type}" is not allowed in the database schema!`);
}

async function apply(db: Kysely<any>, { schema }: CRSchema) {
  for (const table in schema) {
    const current = schema[table];
    // Create tables
    let query = db.schema.createTable(table).ifNotExists();
    for (const column in current.schema) {
      const { type } = current.schema[column];
      query = query.addColumn(
        column,
        column === current.ordered?.[0] ? "blob" : covert(type)
      );
    }
    // Add constrains
    if (current.primary) {
      query = query.addPrimaryKeyConstraint(
        "primary_key",
        current.primary as any
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
    if (current.ordered) {
      await sql`SELECT crsql_fract_as_ordered(${table},${sql.join(
        current.ordered
      )})`.execute(db);
    }
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
  table.ordered = [by, ...grouped];
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

  ordered?: string[];
  indices?: string[][];
  primary?: string[];
  crr?: boolean;
};
type CRSchema = { schema: Record<string, CRTable> };
type CRChange = {
  table: string;
  pk: string;
  cid: string;
  val: string | null;
  db_version: number;
  col_version: number;
  site_id: Uint8Array;
};

export { apply, primary, crr, index, ordered };
export type { CRSchema, CRChange };
