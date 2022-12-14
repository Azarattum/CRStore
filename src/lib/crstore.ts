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

function database<T extends CRSchema>(
  schema: T,
  {
    name = "crstore.db",
    paths = defaultPaths,
    push: remotePush = undefined as Push,
    pull: remotePull = undefined as Pull,
    online = () => !!(globalThis as any).navigator?.onLine,
  } = {}
): Database<Schema<T>> {
  const connection = noSSR(() => init(name, schema, paths));
  const channel = new BroadcastChannel(`${name}-sync`);
  const tabUpdate = (event: MessageEvent) => trigger(event.data, event.data[0]);

  channel.addEventListener("message", tabUpdate);
  globalThis.addEventListener?.("online", pull);
  noSSR(pull);

  const listeners = new Map<string, Set<Updater>>();
  let hold = () => {};

  function subscribe(
    tables: string[],
    callback: Updater,
    options?: { client: string; version: number }
  ) {
    const listener = (changes: any[], sender?: string) =>
      options
        ? options.client !== sender && callback(changes, sender)
        : callback(changes, sender);

    tables.forEach((x) => {
      if (!listeners.has(x)) listeners.set(x, new Set());
      listeners.get(x)?.add(listener);
    });

    // Immediately call when have options
    if (options) {
      connection.then(async (db) => {
        const changes = await db
          .changesSince(options.version, options.client)
          .execute();
        if (changes.length) callback(changes);
      });
    } else callback([]);

    return () => tables.forEach((x) => listeners.get(x)?.delete(listener));
  }

  async function push() {
    if (!remotePush || !online()) return;
    const db = await connection;

    const { current, synced } = await db.selectVersion().execute();
    if (current <= synced) return;

    const changes = await db.changesSince(synced, null).execute();
    await remotePush(changes);
    await db.updateVersion(current).execute();
  }

  async function pull() {
    globalThis.removeEventListener?.("offline", hold);
    hold();

    if (!remotePull || !online()) return;
    const db = await connection;
    const { synced } = await db.selectVersion().execute();
    const client = await db.selectClient().execute();

    await push();
    hold = remotePull(synced, client, async (changes) => {
      if (!changes.length) return;
      await db.insertChanges(changes).execute();
      await trigger(changes, changes[0]);
    });
    globalThis.addEventListener?.("offline", hold);
  }

  async function update<T extends any[]>(operation: Operation<T>, ...args: T) {
    const db = await connection;
    const changes = await db.applyOperation(operation, ...args).execute();
    await trigger(changes);
  }

  async function merge(changes: any[]) {
    if (!changes.length) return;
    const db = await connection;
    await trigger(await db.resolveChanges(changes).execute(), changes[0]);
  }

  async function trigger(changes: any[], sender?: string) {
    if (!changes.length) return;
    const callbacks = new Set<Updater>();
    const tables = affectedTables(changes);

    listeners.get("*")?.forEach((x) => callbacks.add(x));
    tables.forEach((table) =>
      listeners.get(table)?.forEach((x) => callbacks.add(x))
    );

    const promises = [...callbacks].map((x) => x(changes, sender));
    if (!sender) {
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
    store.bind({ connection, subscribe, update } as any, []),
    {
      with: (...args: any[]) =>
        store.bind({ connection, subscribe, update } as any, args),
    }
  );

  return {
    close,
    merge,
    update,
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
  const { connection, update } = this;
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

  const bound: Bound<Actions<Schema>> = {};
  for (const name in actions) {
    bound[name] = (...args: any[]) => update(actions[name], ...args);
  }

  return {
    ...bound,
    subscribe,
    update<T extends any[]>(operation?: Operation<T>, ...args: T) {
      if (!operation) return refresh();
      return update(operation, ...args);
    },
  };
}

export { database };
