import { crr, database, primary, encode } from "$lib";
import { afterAll, expect, it, vi } from "vitest";
import { object, string } from "superstruct";
import { get, writable } from "svelte/store";
import { rm } from "fs/promises";

const delay = (ms = 1) => new Promise((r) => setTimeout(r, ms));
const errored = vi.fn();
const schema = object({
  test: crr(
    primary(
      object({
        id: string(),
        data: string(),
      }),
      "id"
    )
  ),
});

const { store, close, subscribe, merge } = database(schema, {
  name: "test.db",
  error: errored,
});

it("stores data", async () => {
  const item = { id: "1", data: "data" };
  const spy = vi.fn();
  const table = store((db) => db.selectFrom("test").selectAll());
  const unsubscribe = table.subscribe(spy);

  const spy2 = vi.fn();
  const unsubscribe2 = subscribe(["*"], spy2, { client: "", version: 0 });

  expect(spy).toHaveBeenCalledWith([]);
  await delay(10);
  expect(spy).toHaveBeenCalledWith([]);
  expect(spy).toHaveBeenCalledTimes(2);
  await table.update((db) => db.insertInto("test").values(item).execute());
  expect(spy).toHaveBeenCalledTimes(2);
  await delay(50);
  expect(spy).toHaveBeenCalledWith([item]);
  expect(spy).toHaveBeenCalledTimes(3);
  await table.update();
  expect(spy).toHaveBeenCalledTimes(4);
  expect(get(table)).toEqual([item]);
  unsubscribe();

  expect(spy2).toHaveBeenCalledWith(
    expect.arrayContaining(["data", 1, "test", "data"]),
    undefined
  );
  unsubscribe2();
});

it("handles errors", async () => {
  const table2 = store((db) => db.selectFrom("test2" as any).selectAll());
  const table = store((db) => db.selectFrom("test").selectAll());
  expect(table2).rejects.toThrowError();
  expect(table).resolves.toBeTruthy();
  await delay(100);
  expect(errored).toHaveBeenCalled();
});

it("merges changes", async () => {
  const spy = vi.fn();
  const table = store((db) => db.selectFrom("test").selectAll());
  const unsubscribe = table.subscribe(spy);

  expect(spy).toHaveBeenCalledWith([]);
  await delay(50);
  expect(spy).toHaveBeenCalledWith([{ id: "1", data: "data" }]);

  await merge(
    encode([
      {
        site_id: new Uint8Array([1, 2]),
        cid: "data",
        pk: new Uint8Array([1, 11, 1, 49]),
        table: "test",
        val: "updated",
        db_version: 2,
        col_version: 2,
        cl: 1,
        seq: 0,
      },
    ])
  );
  expect(spy).toHaveBeenCalledWith([{ id: "1", data: "updated" }]);
  expect(spy).toHaveBeenCalledTimes(3);
  unsubscribe();
});

it("works with stores", async () => {
  const select = vi.fn((db, query) =>
    db.selectFrom("test").where("data", "=", query).selectAll()
  );
  const spy = vi.fn();

  const query = writable("updated");
  const searched = store.with(query)(select);
  const unsubscribe = searched.subscribe(spy);

  expect(spy).toHaveBeenCalledWith([]);
  await delay(50);
  expect(spy).toHaveBeenCalledWith([{ id: "1", data: "updated" }]);
  query.set("data");
  await delay(50);
  expect(spy).toHaveBeenCalledWith([]);
  expect(spy).toHaveBeenCalledTimes(3);
  unsubscribe();
});

afterAll(async () => {
  close();
  await rm("./test.db");
});
