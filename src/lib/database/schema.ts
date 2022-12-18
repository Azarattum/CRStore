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

async function apply(db: Kysely<unknown>, { schema }: CRSchema) {
  for (const table in schema) {
    let query = db.schema.createTable(table).ifNotExists();
    for (const column in schema[table].schema) {
      const { type, modifiers = [] } = schema[table].schema[column];
      query = query.addColumn(column, covert(type), (col: any) =>
        modifiers.reduce((acc, x) => acc[x](), col)
      );
    }
    await query.execute();

    const columns = schema[table].index;
    if (columns && columns.length) {
      const name = `${table}_${columns.join("_")}`;

      /// This is a raw sql hack until
      //    https://github.com/koskimas/kysely/issues/253 is resolved
      const indexed = columns.map((x) => `"${x}"`).join(",");
      const query = `CREATE INDEX IF NOT EXISTS "${name}" ON "${table}"(${indexed})`;
      await sql([query] as any).execute(db);
    }
    if (schema[table].crsql) {
      await sql`SELECT crsql_as_crr(${table})`.execute(db);
    }
  }
}

function requirePrimaryKey<T extends CRSchema>(
  { schema }: T,
  table: keyof T["schema"]
) {
  const key = Object.entries(schema[table as string].schema).find(
    ([_, value]) => value.modifiers?.includes("primaryKey")
  )?.[0];
  if (key) return key as keyof T["schema"][typeof table]["schema"];
  throw new Error(`Primary key is required on table "${table.toString()}"!`);
}

function parse(change: string | null) {
  if (!change) return null;
  if (change.startsWith("'") && change.endsWith("'")) {
    return change.substring(1, change.length - 1);
  }
  if (Number.isFinite(+change)) return +change;
}

const modify = <T extends object>(struct: T, modifier: string) =>
  Object.assign(struct, {
    modifiers: [...((struct as any).modifiers || []), modifier] as string[],
  });

const primary = <T extends object>(struct: T) => modify(struct, "primaryKey");
const crr = <T extends object>(struct: T) =>
  Object.assign(struct, { crsql: true });
const index = <T extends object>(struct: T, columns: string[]) =>
  Object.assign(struct, { index: columns });

type CRColumn = { type: string; modifiers?: string[] };
type CRTable = {
  schema: Record<string, CRColumn>;
  crsql?: boolean;
  index?: string[];
};
type CRSchema = { schema: Record<string, CRTable> };
type CRChange = {
  table: string;
  pk: string;
  cid: string;
  val: string | null;
  version: number;
  site_id: Uint8Array;
};

export { apply, primary, crr, index, parse, requirePrimaryKey };
export type { CRSchema, CRChange };
