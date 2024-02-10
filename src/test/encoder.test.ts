import { chunk, decode, encode } from "../lib/database/encoder";
import { expect, it } from "vitest";

it("encodes and decodes", () => {
  const schema = [
    ["site_id", "object"],
    ["cid", "string"],
    ["pk", "object"],
    ["table", "string"],
    ["val", "any"],
    ["db_version", "number"],
    ["col_version", "number"],
    ["cl", "number"],
    ["seq", "number"],
  ] as const;

  const samplePlain = [
    {
      site_id: new Uint8Array([
        163, 103, 146, 69, 118, 255, 69, 92, 187, 16, 64, 79, 125, 83, 247, 51,
      ]),
      cid: "order",
      pk: new Uint8Array([1, 33, 76, 224, 139, 12]),
      table: "pla,yback",
      val: new Uint8Array([1, 2, 3]),
      db_version: 78,
      col_version: 2,
      cl: 1,
      seq: 0,
    },
    {
      site_id: new Uint8Array([
        163, 103, 146, 69, 118, 255, 69, 92, 187, 16, 64, 79, 125, 83, 247, 51,
      ]),
      cid: "playlist",
      pk: new Uint8Array([1, 33, 66, 51, 49, 168]),
      table: "library",
      val: -1,
      db_version: 78,
      col_version: 1,
      cl: 1,
      seq: 3,
    },
    {
      site_id: new Uint8Array([
        163, 103, 146, 69, 118, 255, 69, 92, 187, 16, 64, 79, 125, 83, 247, 51,
      ]),
      cid: "track",
      pk: new Uint8Array([1, 33, 66, 51, 49, 168]),
      table: "library",
      val: true,
      db_version: 78,
      col_version: 1,
      cl: 1,
      seq: 4,
    },
    {
      site_id: new Uint8Array([
        163, 103, 146, 69, 118, 255, 69, 92, 187, 16, 64, 79, 125, 83, 247, 51,
      ]),
      cid: "date",
      pk: new Uint8Array([1, 33, 66, 51, 49, 168]),
      table: "library",
      val: 1704614751n,
      db_version: 78,
      col_version: 1,
      cl: 1,
      seq: 5,
    },
    {
      site_id: new Uint8Array([
        163, 103, 146, 69, 118, 255, 69, 92, 187, 16, 64, 79, 125, 83, 247, 51,
      ]),
      cid: "order",
      pk: new Uint8Array([1, 33, 66, 51, 49, 168]),
      table: "library",
      val: "ZI",
      db_version: 78,
      col_version: 2,
      cl: 1,
      seq: 6,
    },
    {
      site_id: new Uint8Array([
        163, 103, 146, 69, 118, 255, 69, 92, 187, 16, 64, 79, 125, 83, 247, 51,
      ]),
      cid: "playback",
      pk: new Uint8Array([
        1, 12, 16, 163, 103, 146, 69, 118, 255, 69, 92, 187, 16, 64, 79, 125,
        83, 247, 51,
      ]),
      table: "devices",
      val: null,
      db_version: 78,
      col_version: 4,
      cl: 1,
      seq: 7,
    },
    {
      site_id: new Uint8Array([
        163, 103, 146, 69, 118, 255, 69, 92, 187, 16, 64, 79, 125, 83, 247, 51,
      ]),
      cid: "progress",
      pk: new Uint8Array([
        1, 12, 16, 163, 103, 146, 69, 118, 255, 69, 92, 187, 16, 64, 79, 125,
        83, 247, 51,
      ]),
      table: "devices",
      val: 0.00700311693548387,
      db_version: 79,
      col_version: 10,
      cl: 1,
      seq: 0,
    },
  ];

  const sampleEncoded =
    `*2o2eSRXb/RVy7EEBPfVP3Mw==,order,ASFM` +
    `4IsM,pla,,yback,&AQID*178,2*21,0,play` +
    `list*/ASFCMzGo*/library,+-1*.1,3,trac` +
    `k,?1,4,date,^1704614751,5,order,'ZI,2` +
    `,6,playback*-AQwQo2eSRXb/RVy7EEBPfVP3` +
    `Mw==*-devices,!,4,7,progress,+0.00700` +
    `311693548387,79,10,0`;

  expect(encode(samplePlain, schema)).toBe(sampleEncoded);
  expect(decode(sampleEncoded, schema)).toEqual(samplePlain);
});

it("escapes split characters", () => {
  const schema = [
    ["test", "string"],
    ["other", "string"],
  ] as const;
  expect(encode([{ test: ",,,", other: "***" }], schema)).toBe(
    ",,,,,,,,******",
  );
  expect(decode(",,,,,,,,******", schema)).toEqual([
    { test: ",,,", other: "***" },
  ]);
});

it("compacts repeating sequences", () => {
  const schema = [["repeated", "any"]] as const;
  const repeated = [
    { repeated: 42 },
    { repeated: 42 },
    { repeated: 42 },
    { repeated: "42" },
  ];

  expect(encode(repeated, schema)).toBe("*.+42,'42");
  expect(decode("*.+42,'42", schema)).toEqual(repeated);
});

it("handles empty data", () => {
  const schema = [["id", "number"]] as const;
  const encoded = encode([], schema);
  expect(encoded).toBe("");
  const decoded = decode(encoded, schema);
  expect(decoded).toEqual([]);
});

it("handles null, undefined and empty values", () => {
  const schema = [
    ["id", "number"],
    ["name", "any"],
  ] as const;

  const encoded = encode(
    [
      { id: 1, name: "" },
      { id: 2, name: null },
      { id: 3, name: undefined },
      { id: 4, name: 0 },
      { id: 5, name: false },
      { id: 6, name: new Uint8Array([]) },
    ],
    schema,
  );
  expect(encoded).toBe(",1,',2*-!,3,4,+0,5,?0,6,&");

  const decoded = decode(encoded, schema);
  expect(decoded).toEqual([
    { id: 1, name: "" },
    { id: 2, name: null },
    { id: 3, name: null },
    { id: 4, name: 0 },
    { id: 5, name: false },
    { id: 6, name: new Uint8Array([]) },
  ]);
});

it("chunks values", () => {
  const v = (version: number) => ({ db_version: version });
  const vs = (version: number, length: number) =>
    Array.from<ReturnType<typeof v>>({ length }).fill(v(version));

  expect(chunk([v(1), v(2), v(3), v(4), v(5), v(6)], { size: 2 })).toEqual([
    [v(1), v(2)],
    [v(3), v(4)],
    [v(5), v(6)],
  ]);

  expect(
    chunk([v(3), ...vs(5, 5), v(8), v(10), v(11), v(11)], { size: 5 }),
  ).toEqual([[v(3)], vs(5, 5), [v(8), v(10), v(11), v(11)]]);

  expect(
    chunk([v(3), v(3), v(8), ...vs(5, 5), v(10), v(11), v(11)], { size: 7 }),
  ).toEqual([
    [v(3), v(3), v(8)],
    [...vs(5, 5), v(10)],
    [v(11), v(11)],
  ]);

  expect(chunk([v(1), v(2), v(3)], { size: 1 })).toEqual([
    [v(1)],
    [v(2)],
    [v(3)],
  ]);

  expect(
    chunk([v(3), ...vs(5, 6), v(8), v(10), v(11), v(11)], { size: 5 }),
  ).toEqual([[v(3)], vs(5, 5), [v(5), v(8), v(10), v(11), v(11)]]);

  expect(
    chunk([v(3), ...vs(5, 6), v(8), v(10), v(11), v(11)], {
      strict: false,
      size: 5,
    }),
  ).toEqual([[v(3)], vs(5, 6), [v(8), v(10), v(11), v(11)]]);
});

it("does not chunks small changesets", () => {
  const v = (version: number) => ({ db_version: version });
  const changes = [v(1), v(2), v(3), v(4)];
  expect(chunk(changes, { size: 5 })[0]).toBe(changes);
});
