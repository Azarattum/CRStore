import type {
  Actions,
  Bound,
  Context,
  Operation,
  Pull,
  Push,
  Store,
  Updater,
  View,
} from "./types";
import { affectedTables } from "./database/operations";
import type { CRSchema } from "./database/schema";
import { writable } from "svelte/store";
import { init } from "./database";

const noSSR = <T extends Promise<any>>(fn: () => T) =>
  import.meta.env?.SSR
    ? (new Promise<unknown>(() => {}) as T)
    : (new Promise((r) => setTimeout(() => r(fn()))) as T);

function database<T extends CRSchema>(
  schema: T,
  {
    name = "crstore.db",
    push: remotePush = undefined as Push,
    pull: remotePull = undefined as Pull,
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

  const listeners = new Map<string, Set<Updater>>();
  let hold = () => {};

  async function push() {
    if (!remotePush || !navigator.onLine) return;
    const db = await connection;
    const lastVersion = getVersion();
    const currentVersion = await db.selectVersion().execute();
    if (currentVersion <= lastVersion) return;

    /// Wait till "=" resolution is implemented
    // const changes = await db.changesSince(lastVersion, "=", client).execute();
    const changes = await db.changesSince(lastVersion).execute();
    await remotePush(changes);
    setVersion(currentVersion);
  }

  async function pull() {
    globalThis.removeEventListener?.("offline", hold);
    hold();

    if (!remotePull || !navigator.onLine) return;
    const db = await connection;
    const version = getVersion();
    const client = await db.selectClient().execute();

    await push();
    hold = remotePull(version, client, async (changes) => {
      await db.insertChanges(changes).execute();
      const newVersion = await db.selectVersion().execute();
      setVersion(newVersion);
      trigger(changes, false);
    });
    globalThis.addEventListener?.("offline", hold);
  }

  function subscribe(
    tables: string[],
    callback: Updater,
    options?: { client: string; version: number }
  ) {
    tables.forEach((x) => {
      if (!listeners.has(x)) listeners.set(x, new Set());
      listeners.get(x)?.add(callback);
    });

    // Immediately call the updater
    if (options) {
      connection.then(async (db) => {
        const changes = await db
          .changesSince(options.version, "!=", options.client)
          .execute();
        callback(changes);
      });
    } else callback([]);

    return () => tables.forEach((x) => listeners.get(x)?.delete(callback));
  }

  async function merge(changes: any[]) {
    const db = await connection;
    trigger(await db.resolveChanges(changes).execute());
  }

  async function trigger(changes: any[], local = true) {
    if (!changes.length) return;
    const callbacks = new Set<Updater>();
    const tables = affectedTables(changes);
    const sender = changes[0];

    listeners.get("*")?.forEach((x) => callbacks.add(x));
    tables.forEach((table) =>
      listeners.get(table)?.forEach((x) => callbacks.add(x))
    );

    callbacks.forEach((x) => x(changes, sender));
    if (local) {
      channel.postMessage(changes);
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
    merge,
    subscribe,
    connection,
    store: store.bind({ connection, subscribe, trigger }) as Store<T>,
  };
}

function store<Schema, Type>(
  this: Context<Schema>,
  view: View<Schema, Type>,
  actions: Actions<Schema> = {}
) {
  const { connection, trigger } = this;
  const { subscribe, set } = writable<Type[]>([], () => {
    let unsubscribe: (() => void) | null = () => {};
    connection.then((db) => {
      if (!unsubscribe) return;
      const query = view(db).compile();
      unsubscribe = this.subscribe(affectedTables(query), refresh);
    });

    return () => (unsubscribe?.(), (unsubscribe = null));
  });

  async function refresh() {
    const db = await connection;
    set(await view(db).execute());
  }

  async function update<T extends any[]>(operation?: Operation<T>, ...args: T) {
    if (!operation) return refresh();
    const db = await (connection as ReturnType<typeof init>);
    trigger(await db.applyOperation(operation, ...args).execute());
  }

  const bound: Bound<Actions<Schema>> = {};
  for (const name in actions) {
    bound[name] = (...args: any[]) => update(actions[name], ...args);
  }

  return {
    ...bound,
    subscribe,
    update,
  };
}

export { database };
