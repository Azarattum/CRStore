import {
  array,
  literal,
  nullable,
  number,
  object,
  string,
  union,
  type Struct,
} from "superstruct";
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
    if (schema[table].crsql) {
      sql`SELECT crsql_as_crr(${table})`.execute(db);
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

function encode(data: Uint8Array): string;
function encode<T extends Record<any, any>>(data: T): Encoded<T>;
function encode(data: Uint8Array | Record<any, any>) {
  if (data instanceof Uint8Array) return String.fromCharCode(...data);
  const copy = {} as Record<any, any>;
  for (const key in data) {
    if (data[key] instanceof Uint8Array) copy[key] = encode(data[key]);
    else copy[key] = data[key];
  }
  return copy;
}

function decode(data: string): Uint8Array;
function decode<T extends Record<any, any>>(data: Encoded<T>, key: string): T;
function decode(data: string | Record<any, any>, target?: string) {
  if (typeof data === "string") {
    return Uint8Array.from([...data].map((x) => x.charCodeAt(0)));
  }
  const copy = {} as Record<any, any>;
  for (const key in data) {
    if (key !== target || typeof data[key] !== "string") copy[key] = data[key];
    else copy[key] = decode(data[key]);
  }
  return copy;
}

const modify = <T extends object>(struct: T, modifier: string) =>
  Object.assign(struct, {
    modifiers: [...((struct as any).modifiers || []), modifier] as string[],
  });

const primary = <T extends object>(struct: T) => modify(struct, "primaryKey");
const crr = <T extends object>(struct: T) =>
  Object.assign(struct, { crsql: true });

/**
 * Creates a changes
 * @param schema Schema to derive the validator from
 */
function changes({ schema }: CRSchema) {
  const tables = Object.entries(schema)
    .filter(([_, { crsql }]) => crsql)
    .map(([x, table]) => {
      const columns = Object.keys(table.schema).map((x) => literal(x));
      return object({
        table: literal(x),
        pk: string(),
        cid: union([...columns, literal("__crsql_del")] as any),
        val: nullable(string()),
        version: number(),
        site_id: string(),
      });
    });

  type InnerStruct = typeof tables extends Struct<any, infer S>[] ? S : unknown;
  return array(union(tables as any)) as any as Struct<
    Encoded<CRChange>[],
    Struct<Encoded<CRChange>, InnerStruct>
  >;
}

type CRColumn = { type: string; modifiers?: string[] };
type CRTable = { schema: Record<string, CRColumn>; crsql?: boolean };
type CRSchema = { schema: Record<string, CRTable> };
type CRChange = {
  table: string;
  pk: string;
  cid: string;
  val: string | null;
  version: number;
  site_id: Uint8Array;
};
type Encoded<T> = {
  [K in keyof T]: T[K] extends Uint8Array ? string : T[K];
};

export {
  apply,
  encode,
  decode,
  primary,
  crr,
  parse,
  changes,
  requirePrimaryKey,
};
export type { CRSchema, CRChange, Encoded };
