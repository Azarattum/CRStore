import { afterAll, expect, it, vi } from "vitest";
import { object, string } from "superstruct";
import { get, writable } from "svelte/store";
import { crr, primary, encode } from "$lib";
import { database } from "$lib/svelte";
import { rm } from "fs/promises";
import { decode } from "$lib";

const delay = (ms = 1) => new Promise((r) => setTimeout(r, ms));
const errored = vi.fn();
const schema = object({
  test: crr(
    primary(
      object({
        id: string(),
        data: string(),
      }),
      "id",
    ),
  ),
});

const { replicated, close, subscribe, update, merge } = database(schema, {
  name: "test.db",
  error: errored,
  ssr: true,
});

it("stores data", async () => {
  const item = { id: "1", data: "data" };
  const spy = vi.fn();
  const table = replicated((db) => db.selectFrom("test").selectAll());
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
    expect.stringContaining(",data,AQsBMQ==,test,'data,1,1,1,0"),
    undefined,
  );
  unsubscribe2();
});

it("handles errors", async () => {
  const table2 = replicated((db) => db.selectFrom("test2" as any).selectAll());
  const table = replicated((db) => db.selectFrom("test").selectAll());

  const rejection = expect(table2.then()).rejects.toThrowError();
  const resolution = expect(table.then()).resolves.toBeTruthy();
  await delay(100);
  expect(errored).toHaveBeenCalled();
  await rejection;
  await resolution;
});

it("merges changes", async () => {
  const spy = vi.fn();
  const table = replicated((db) => db.selectFrom("test").selectAll());
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
    ]),
  );
  expect(spy).toHaveBeenCalledWith([{ id: "1", data: "updated" }]);
  expect(spy).toHaveBeenCalledTimes(3);
  unsubscribe();
});

it("works with stores", async () => {
  const select = vi.fn((db, query) =>
    db.selectFrom("test").where("data", "=", query).selectAll(),
  );
  const spy = vi.fn();

  const query = writable("updated");
  const searched = replicated.with(query)(select);
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

it("unsubscribes from stores", async () => {
  const [subbed, unsubbed, executed] = [vi.fn(), vi.fn(), vi.fn()];
  const dependency = writable(1, () => (subbed(), unsubbed));
  const target = replicated.with(dependency)((db, dep) => {
    executed(dep);
    return db.selectFrom("test").selectAll();
  });

  expect(executed).toHaveBeenCalledTimes(0);
  expect(unsubbed).toHaveBeenCalledTimes(1);
  expect(subbed).toHaveBeenCalledTimes(1);

  const stop = target.subscribe(() => { });
  await delay(50);

  expect(executed).toHaveBeenCalledTimes(1);
  expect(unsubbed).toHaveBeenCalledTimes(1);
  expect(subbed).toHaveBeenCalledTimes(2);

  stop();

  expect(executed).toHaveBeenCalledTimes(1);
  expect(unsubbed).toHaveBeenCalledTimes(2);
  expect(subbed).toHaveBeenCalledTimes(2);

  expect(executed).toHaveBeenCalledWith(1);
});

it("merges large changesets", async () => {
  const sqliteMaxVariables = 32766;
  const length = Math.ceil(sqliteMaxVariables / 9);
  const changeset = Array.from({ length }).map((_, i) => ({
    site_id: new Uint8Array([1, 2]),
    cid: "data",
    pk: new Uint8Array([1, 11, 1, 49]),
    table: "test",
    val: `value ${i}`,
    db_version: i,
    col_version: i,
    cl: 1,
    seq: 0,
  }));

  await merge(encode(changeset));

  const table = replicated((db) => db.selectFrom("test").selectAll());
  expect((await table)[0].data).toBe(`value ${length - 1}`);
});

it("chunks changesets sent to network", async () => {
  for (let chunk = 0; chunk < 50; chunk++) {
    update((db) =>
      db
        .insertInto("test")
        .values(
          Array.from({ length: 100 }).map((_, i) => ({
            id: `#${chunk}-${i}`,
            data: `data ${i}`,
          })),
        )
        .execute(),
    );
    await delay(0);
  }

  const success = vi.fn();
  const callback = vi.fn((changes) => {
    const count = decode(changes).length;
    expect(count).toBeLessThanOrEqual(1000);
    expect(count).toBeGreaterThan(0);
    success();
  });
  subscribe(["test"], callback, { client: "", version: 0 });

  await delay(10);
  expect(callback).toHaveBeenCalledTimes(6);
  expect(success).toHaveBeenCalledTimes(6);
});

afterAll(async () => {
  await close();
  await rm("./test.db");
  await rm("./test.db-shm", { force: true });
  await rm("./test.db-wal", { force: true });
});
