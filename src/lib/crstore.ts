import type {
  Operation,
  Database,
  Actions,
  Context,
  Updater,
  Schema,
  Bound,
  Pull,
  Push,
  View,
} from "./types";
import { createQueryId, type QueryId } from "kysely/dist/cjs/util/query-id";
import { derived, writable, type Readable } from "svelte/store";
import { affectedTables } from "./database/operations";
import type { CRSchema } from "./database/schema";
import { defaultPaths, init } from "./database";
import type { CompiledQuery } from "kysely";

const noSSR = <T extends Promise<any>>(fn: () => T) =>
  import.meta && import.meta.env && import.meta.env.SSR
    ? (new Promise<unknown>(() => {}) as T)
    : (new Promise((r) => setTimeout(() => r(fn()))) as T);

if (!("navigator" in globalThis)) {
  (globalThis as any).navigator = { onLine: false };
}

function database<T extends CRSchema>(
  schema: T,
  {
    name = "crstore.db",
    push: remotePush = undefined as Push,
    pull: remotePull = undefined as Pull,
    paths = defaultPaths,
  } = {}
): Database<Schema<T>> {
  const connection = noSSR(() => init(name, schema, paths));
  const channel = new BroadcastChannel(`${name}-sync`);
  const tabUpdate = (event: MessageEvent) => trigger(event.data, false);

  const getVersion = () => +(localStorage.getItem(`${name}-sync`) || 0);
  const setVersion = async (version: number) =>
    localStorage.setItem(`${name}-sync`, version.toString());

  channel.addEventListener("message", tabUpdate);
  globalThis.addEventListener?.("online", pull);
  noSSR(pull);

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
      await trigger(changes, false);
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

    // Immediately call when have options
    if (options) {
      connection.then(async (db) => {
        const changes = await db
          .changesSince(options.version, "!=", options.client)
          .execute();
        if (changes.length) callback(changes);
      });
    } else callback([]);

    return () => tables.forEach((x) => listeners.get(x)?.delete(callback));
  }

  async function merge(changes: any[]) {
    const db = await connection;
    await trigger(await db.resolveChanges(changes).execute());
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

    const promises = [...callbacks].map((x) => x(changes, sender));
    if (local) {
      channel.postMessage(changes);
      await push();
    }

    await Promise.all(promises);
  }

  async function close() {
    hold();
    listeners.clear();
    globalThis.removeEventListener?.("online", pull);
    globalThis.removeEventListener?.("offline", hold);
    channel.removeEventListener("message", tabUpdate);
    await connection.then((x) => x.destroy());
  }

  const bound: any = Object.assign(
    store.bind({ connection, subscribe, trigger }, []),
    {
      with: (...args: any[]) =>
        store.bind({ connection, subscribe, trigger }, args) as any,
    }
  );

  return {
    close,
    merge,
    subscribe,
    connection,
    store: bound,
  };
}

function store<Schema, Type>(
  this: Context<Schema>,
  dependencies: Readable<unknown>[],
  view: View<Schema, Type>,
  actions: Actions<Schema> = {}
) {
  const { connection, trigger } = this;
  const dependency = derived(dependencies, (x) => x);

  let query = null as CompiledQuery | null;
  let id = null as QueryId | null;

  const { subscribe, set } = writable<Type[]>([], () => {
    let unsubscribe: (() => void) | null = () => {};
    connection.then((db) => {
      if (!unsubscribe) return;
      let forget = () => {};
      const stop = dependency.subscribe((values) => {
        const node = view(db, ...(values as [])).toOperationNode();
        const tables = affectedTables(node);
        const executor = db.getExecutor();

        id = createQueryId();
        query = executor.compileQuery(executor.transformQuery(node, id), id);

        forget();
        forget = this.subscribe(tables, refresh);
      });
      unsubscribe = () => (stop(), forget());
    });

    return () => (unsubscribe?.(), (unsubscribe = null));
  });

  async function refresh() {
    const db = await connection;
    if (!query || !id) return;
    const { rows } = await db.getExecutor().executeQuery(query, id);
    set(rows as Type[]);
  }

  async function update<T extends any[]>(operation?: Operation<T>, ...args: T) {
    if (!operation) return refresh();
    const db = await (connection as ReturnType<typeof init>);
    const changes = await db.applyOperation(operation, ...args).execute();
    await trigger(changes);
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
