import {
  decode,
  type CRChange,
  type CRSchema,
  type Encoded,
} from "./database/schema";
import { requirePrimaryKey, parse, encode } from "./database/schema";
import { writable, type Subscriber } from "svelte/store";
import type { Infer, Struct } from "superstruct";
import type { Kysely } from "kysely";
import { init } from "./database/";

const defaultPull = (changes: Encoded<CRChange>[]): any => {};
const defaultPush =
  (
    version: number,
    client: string,
    callback: (changes: Encoded<CRChange>[]) => any
  ) =>
  () => {};

function crstore<T extends CRSchema>(
  table: keyof T["schema"],
  schema: T,
  {
    name = "crstore",
    push: remotePush = defaultPull,
    pull: remotePull = defaultPush,
  } = {}
) {
  type Schema = T extends Struct<any> ? Infer<T> : unknown;
  type DB = Awaited<ReturnType<typeof init<T>>>;
  type Table = typeof table extends keyof Schema
    ? Record<string, Schema[typeof table]>
    : unknown;
  type Store = { set: Subscriber<Table>; db: DB };

  const channel = new BroadcastChannel(`${name}-sync`);
  const primaryKey = requirePrimaryKey(schema, table);
  const getVersion = () => +(localStorage.getItem(`${name}-sync`) || -1);
  const setVersion = (version: number) =>
    localStorage.setItem(`${name}-sync`, version.toString());

  let resolve = (store: Store) => {};
  let store = new Promise<Store>((r) => (resolve = r));

  const { subscribe, update } = writable<Table>(undefined, (set) => {
    if (import.meta.env.SSR) return;
    let unsubscribe = () => {};
    const startSync = () => pull().then((x) => (unsubscribe = x));
    const stopSync = () => unsubscribe();
    const tabMerge = (event: MessageEvent) => merge(event.data);

    setTimeout(async () => {
      await init(name, schema).then((db) => resolve({ set, db }));
      refresh();
      addEventListener("online", startSync);
      addEventListener("offline", stopSync);
      channel.addEventListener("message", tabMerge);
      if (navigator.onLine) startSync();
    });

    return async () => {
      const { db } = await store;
      stopSync();
      db?.destroy();
      removeEventListener("online", startSync);
      removeEventListener("offline", stopSync);
      channel.removeEventListener("message", tabMerge);
      store = new Promise<Store>((r) => (resolve = r));
    };
  });

  function merge(changes: CRChange[]) {
    const delta: Record<string, any> = {};
    changes
      .filter((x) => x.table === table)
      .forEach((change) => {
        const id = parse(change.pk);
        if (id == null) return;
        delta[id] = Object.assign(delta[id] || {}, {
          [change.cid]: parse(change.val),
        });
      });

    update((table: any) => {
      for (const key in delta) {
        if ("__crsql_del" in delta[key]) {
          delete table[key];
          continue;
        }
        if (!table[key]) table[key] = { [primaryKey]: key };
        Object.assign(table[key], delta[key]);
      }
      return table;
    });
  }

  async function refresh() {
    const { set, db } = await store;
    const data = await db
      .selectFrom(table as any)
      .selectAll()
      .execute();
    set(Object.fromEntries(data.map((x: any) => [x[primaryKey], x])));
  }

  async function push() {
    if (!navigator.onLine) return;
    const { db } = await store;
    const lastVersion = getVersion();
    const currentVersion = await db.selectVersion().execute();
    if (currentVersion <= lastVersion) return;

    const changes = await db.changesSince(lastVersion).execute();
    await remotePush(changes.map(encode<CRChange>));
    setVersion(currentVersion);
  }

  async function pull() {
    const { db } = await store;
    const version = getVersion();
    const client = await db.selectClient().execute();

    await push();
    return remotePull(version, client, async (changes) => {
      const decoded = changes.map((x) => decode(x, "site_id"));
      const version = await db.selectVersion().execute();
      await db.insertChanges(decoded).execute();
      const resolved = await db.changesSince(version).execute();
      merge(resolved);
      const newVersion = await db.selectVersion().execute();
      setVersion(newVersion);
    });
  }

  async function transact(operation: (db: Kysely<Schema>) => any) {
    const { db } = await store;
    const version = await db.selectVersion().execute();
    await operation(db);
    const changes = await db.changesSince(version).execute();
    merge(changes);
    channel.postMessage(changes);
    await push();
  }

  return {
    subscribe,
    update: transact,
  };
}

export { crstore };
