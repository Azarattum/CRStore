import { afterAll, expect, it, vi } from "vitest";
import { crr, database, primary } from "$lib";
import { object, string } from "superstruct";
import { get, writable } from "svelte/store";
import { rm } from "fs/promises";

const delay = (ms = 1) => new Promise((r) => setTimeout(r, ms));
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
});

it("stores data", async () => {
  const item = { id: "1", data: "data" };
  const spy = vi.fn();
  const table = store((db) => db.selectFrom("test").selectAll());
  const unsubscribe = table.subscribe(spy);

  expect(spy).toHaveBeenCalledWith([]);
  await delay(10);
  expect(spy).toHaveBeenCalledWith([]);
  expect(spy).toHaveBeenCalledTimes(2);
  await table.update((db) => db.insertInto("test").values(item).execute());
  expect(spy).toHaveBeenCalledWith([item]);
  expect(spy).toHaveBeenCalledTimes(3);
  await table.update();
  expect(spy).toHaveBeenCalledTimes(4);
  expect(get(table)).toEqual([item]);
  unsubscribe();
});

it("gives back changes", async () => {
  const spy = vi.fn();
  const unsubscribe = subscribe(["*"], spy, { client: "", version: 0 });
  await delay();
  expect(spy).toHaveBeenCalledWith(
    expect.arrayContaining(["data", "'1'", "test", "'data'"])
  );
  unsubscribe();
});

it("merges changes", async () => {
  const spy = vi.fn();
  const table = store((db) => db.selectFrom("test").selectAll());
  const unsubscribe = table.subscribe(spy);

  expect(spy).toHaveBeenCalledWith([]);
  await delay(50);
  expect(spy).toHaveBeenCalledWith([{ id: "1", data: "data" }]);
  const changes = ["client", "data", "'1'", "test", "'updated'", 2, 2];
  await merge(changes);
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
  await delay();
  expect(spy).toHaveBeenCalledWith([]);
  expect(spy).toHaveBeenCalledTimes(3);
  unsubscribe();
});

afterAll(async () => {
  close();
  await rm("./test.db");
});
