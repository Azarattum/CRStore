const types = {
  boolean: "?",
  number: "+",
  string: "'",
  object: "&",
  bigint: "^",
  null: "!",
  "?": "boolean",
  "+": "number",
  "'": "string",
  "^": "bigint",
  "&": "object",
  "!": "null",
} as const;

const encoders = {
  any: (x: any): string =>
    typeof x in types && x != null
      ? types[typeof x as keyof typeof types] +
          encoders[typeof x as keyof typeof encoders]?.(x as never) ||
        x.toString()
      : "!",
  object: (x: number[]) => btoa(String.fromCharCode.apply(null, x)),
  number: (x: number) => x.toString(),
  string: (x: string) => x.replaceAll(",", ",,").replaceAll("*", "**"),
  bigint: (x: BigInt) => x.toString(),
  boolean: (x: boolean) => (+x).toString(),
} as const;

const decoders = {
  any: (x: string): Uint8Array | null | number | string | boolean | bigint =>
    decoders[types[x[0] as keyof typeof types] as keyof typeof decoders]?.(
      x.slice(1)
    ),
  object: (x: string) =>
    Uint8Array.from([...atob(x)].map((x) => x.charCodeAt(0))),
  number: (x: string) => parseFloat(x),
  string: (x: string) => x.replaceAll(",,", ",").replaceAll("**", "*"),
  bigint: (x: string) => BigInt(x),
  boolean: (x: string) => !!+x,
  null: () => null,
} as const;

export function encode<TSchema extends Schema>(
  data: FromSchema<TSchema>[],
  schema: TSchema
) {
  const entries: [string, number][] = [];
  const last: Record<string, any> = {};
  for (const item of data) {
    for (const [id, type] of schema) {
      const encoded = encoders[type](item[id as keyof typeof item]);
      if (last[id]?.[0] !== encoded) {
        const data: [string, number] = [encoded, 1];
        entries.push(data);
        last[id] = data;
      } else {
        last[id][1] += 1;
      }
    }
  }
  return entries
    .map(
      ([data, count]) =>
        (count > 1 ? "*" + String.fromCharCode(count + 30) : ",") + data
    )
    .join("");
}

export function decode<TSchema extends Schema>(data: string, schema: TSchema) {
  const items: [string, number][] = [];

  for (let position = 0; position < data.length; ) {
    let next = position - 1;
    do {
      next = [",", "*"]
        .map((x) => data.indexOf(x, next + 2))
        .filter((x) => ~x)
        .reduce((a, b) => Math.min(a, b), Infinity);
    } while (data[next + 1] === data[next] && next !== Infinity);

    let buffer = data.slice(position, next);
    const single = buffer[0] === ",";
    items.push([
      buffer.slice(single ? 1 : 2),
      single ? 1 : buffer.charCodeAt(1) - 30,
    ]);
    position = next;
  }

  const entries = items.slice(0, schema.length);
  const decoded: FromSchema<TSchema>[] = [];
  let current = schema.length;

  outer: for (;;) {
    const item: any = {};
    for (let i = 0; i < schema.length; i++) {
      if (!entries[i]) break outer;
      const [key, type] = schema[i];
      item[key] = decoders[type](entries[i][0]);
      entries[i][1] -= 1;
      if (!entries[i][1]) entries[i] = items[current++];
    }
    decoded.push(item);
  }

  return decoded;
}

type Types = {
  object: Uint8Array;
  boolean: boolean;
  number: number;
  string: string;
  bigint: bigint;
  any: unknown;
  null: null;
};

type Schema = readonly (readonly [string, keyof typeof encoders])[];

type FromSchema<TSchema extends Schema> = {
  [K in TSchema[number][0]]: Types[Extract<
    TSchema[number],
    readonly [K, any]
  >[1]];
} & NonNullable<unknown>;
