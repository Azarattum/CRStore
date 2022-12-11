import type { CRChange, CRSchema, Encoded } from "./database/schema";
import type { Actions, Bound, Context, Query, Store, View } from "./types";
import { decode, encode } from "./database/schema";
import { writable } from "svelte/store";
import type { Kysely, TableNode } from "kysely";
import { affectedTables, init } from "./database";

const defaultPush = (changes: Encoded<CRChange>[], client: string): any => {};
const defaultPull =
  (
    version: number,
    client: string,
    callback: (changes: Encoded<CRChange>[]) => any
  ) =>
  () => {};

const noSSR = <T extends Promise<any>>(fn: () => T) =>
  import.meta.env.SSR
    ? (new Promise<unknown>(() => {}) as T)
    : (new Promise((r) => setTimeout(() => r(fn()))) as T);

function database<T extends CRSchema>(
  schema: T,
  {
    name = "crstore",
    push: remotePush = defaultPush,
    pull: remotePull = defaultPull,
  } = {}
) {
  const connection = noSSR(() => init(name, schema));
  const channel = new BroadcastChannel(`${name}-sync`);
  const tabUpdate = (event: MessageEvent) => trigger(event.data, false);

  const getVersion = (type: "pull" | "push") =>
    +(localStorage.getItem(`${name}-sync-${type}`) || 0);
  const setVersion = async (version: number, type: "pull" | "push") => {
    /// Debug
    console.log(type, getVersion(type), "->", version);
    localStorage.setItem(`${name}-sync-${type}`, version.toString());
  };

  channel.addEventListener("message", tabUpdate);
  globalThis.addEventListener?.("online", sync);
  noSSR(async () => navigator.onLine && sync());

  let stopSync = () => {};
  const listeners = new Map<string, Set<() => any>>();

  async function push() {
    if (!navigator.onLine) return;
    const db = await connection;
    const lastVersion = getVersion("push");
    const currentVersion = await db.selectVersion().execute();
    if (currentVersion <= lastVersion) return;

    /// Wait till "=" resolution is implemented
    const client = await db.selectClient().execute();
    // const changes = await db.changesSince(lastVersion, "=", client).execute();
    const changes = await db.changesSince(lastVersion).execute();
    await remotePush(changes.map(encode<CRChange>), client);
    setVersion(currentVersion, "push");
  }

  async function pull() {
    const db = await connection;
    const version = getVersion("pull");
    const client = await db.selectClient().execute();

    return remotePull(version, client, async (changes) => {
      const decoded = changes.map((x) => decode(x, "site_id"));
      await db.insertChanges(decoded).execute();
      const newVersion = await db.selectVersion().execute();
      setVersion(newVersion, "pull");

      const tables = new Set<string>();
      changes.forEach((x) => tables.add(x.table));
      trigger([...tables], false);
    });
  }

  async function sync() {
    await push();
    stopSync();
    globalThis.removeEventListener?.("offline", stopSync);
    stopSync = await pull();
    globalThis.addEventListener?.("offline", stopSync);
  }

  function subscribe(tables: string[], callback: () => any) {
    tables.forEach((x) => {
      if (!listeners.has(x)) listeners.set(x, new Set());
      listeners.get(x)?.add(callback);
    });
    return () => tables.forEach((x) => listeners.get(x)?.delete(callback));
  }

  function trigger(tables: string[], local = true) {
    const callbacks = new Set<() => void>();
    tables.forEach((table) =>
      listeners.get(table)?.forEach((x) => callbacks.add(x))
    );

    callbacks.forEach((x) => x());
    if (local) {
      channel.postMessage(tables);
      push();
    }
  }

  function close() {
    stopSync();
    listeners.clear();
    connection.then((x) => x.destroy());
    channel.removeEventListener("message", tabUpdate);
    globalThis.removeEventListener?.("online", sync);
    globalThis.removeEventListener?.("offline", stopSync);
  }

  return {
    close,
    store: store.bind({ connection, subscribe, trigger }) as Store<T>,
  };
}

function store<Schema, Type>(
  this: Context<Schema>,
  view: View<Schema, Type>,
  actions: Actions<Schema> = {}
) {
  const connection = this.connection;
  const trigger = this.trigger;

  const { subscribe, set } = writable<Type[]>(undefined, () => {
    let unsubscribe: (() => void) | null = () => {};
    connection.then((db) => {
      if (!unsubscribe) return;
      const query = view(db).compile();
      unsubscribe = this.subscribe(affectedTables(query), refresh);
    });

    refresh();
    return () => (unsubscribe?.(), (unsubscribe = null));
  });

  async function refresh() {
    const db = await connection;
    set(await view(db).execute());
  }

  async function update(operation?: (db: Kysely<Schema>) => Query<unknown>) {
    if (!operation) return refresh();
    const query = operation(await connection);
    await query.execute();
    trigger(affectedTables(query.compile()));
  }

  const bound: Bound<Actions<Schema>> = {};
  for (const name in actions) {
    bound[name] = async (...args: any[]) => {
      const query = actions[name](await connection, ...args);
      await query.execute();
      trigger(affectedTables(query.compile()));
    };
  }

  return {
    ...bound,
    subscribe,
    update,
  };
}

export { database };
