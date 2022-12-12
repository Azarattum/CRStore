import type { Actions, Bound, Context, Query, Store, View } from "./types";
import type { CRChange, CRSchema, Encoded } from "./database/schema";
import { affectedTables, init } from "./database";
import { writable } from "svelte/store";
import type { Kysely } from "kysely";

const defaultPush = (changes: Encoded<CRChange>[]): any => {};
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

  const getVersion = () => +(localStorage.getItem(`${name}-sync`) || 0);
  const setVersion = async (version: number) =>
    localStorage.setItem(`${name}-sync`, version.toString());

  channel.addEventListener("message", tabUpdate);
  globalThis.addEventListener?.("online", pull);
  noSSR(() => pull());

  const listeners = new Map<string, Set<() => any>>();
  let hold = () => {};

  async function push() {
    if (!navigator.onLine) return;
    const db = await connection;
    const lastVersion = getVersion();
    const currentVersion = await db.selectVersion().execute();
    if (currentVersion <= lastVersion) return;

    const client = await db.selectClient().execute();
    /// Wait till "=" resolution is implemented
    // const changes = await db.changesSince(lastVersion, "=", client).execute();
    const changes = await db.changesSince(lastVersion).execute();
    await remotePush(changes.filter((x) => x.site_id === client));
    setVersion(currentVersion);
  }

  async function pull() {
    globalThis.removeEventListener?.("offline", hold);
    hold();

    if (!navigator.onLine) return;
    const db = await connection;
    const version = getVersion();
    const client = await db.selectClient().execute();

    await push();
    hold = remotePull(version, client, async (changes) => {
      await db.insertChanges(changes).execute();
      const newVersion = await db.selectVersion().execute();
      setVersion(newVersion);

      const tables = new Set<string>();
      changes.forEach((x) => tables.add(x.table));
      trigger([...tables], false);
    });
    globalThis.addEventListener?.("offline", hold);
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
    hold();
    listeners.clear();
    connection.then((x) => x.destroy());
    globalThis.removeEventListener?.("online", pull);
    globalThis.removeEventListener?.("offline", hold);
    channel.removeEventListener("message", tabUpdate);
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
  const { connection, trigger } = this;
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
