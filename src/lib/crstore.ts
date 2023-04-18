import type {
  Operation,
  Database,
  Actions,
  Context,
  Updater,
  QueryId,
  Schema,
  Bound,
  Pull,
  Push,
  View,
} from "./types";
import { derived, writable, type Readable } from "svelte/store";
import { affectedTables } from "./database/operations";
import type { CRSchema } from "./database/schema";
import { defaultPaths, init } from "./database";
import type { CompiledQuery } from "kysely";

function database<T extends CRSchema>(
  schema: T,
  {
    ssr = false,
    name = "crstore.db",
    paths = defaultPaths,
    push: remotePush = undefined as Push,
    pull: remotePull = undefined as Pull,
    online = () => !!(globalThis as any).navigator?.onLine,
  } = {}
): Database<Schema<T>> {
  const dummy = !ssr && !!import.meta.env?.SSR;
  const connection = dummy
    ? new Promise<never>(() => {})
    : init(name, schema, paths);
  const channel = new BroadcastChannel(`${name}-sync`);
  const tabUpdate = (event: MessageEvent) => trigger(event.data, event.data[0]);

  channel.addEventListener("message", tabUpdate);
  globalThis.addEventListener?.("online", pull);

  const listeners = new Map<string, Set<Updater>>();
  let hold = () => {};
  pull();

  const queue = new Map<QueryId, CompiledQuery>();
  let queueing = null as Promise<Map<QueryId, unknown[]>> | null;
  const raf = globalThis.requestAnimationFrame || globalThis.setTimeout;
  async function dequeue() {
    if (queueing) return queueing;
    return (queueing = new Promise((resolve) =>
      raf(async () => {
        const db = await connection;
        const result = new Map<QueryId, unknown[]>();
        await db.transaction().execute(async (trx) => {
          for (const [id, query] of queue.entries()) {
            const { rows } = await trx.getExecutor().executeQuery(query, id);
            result.set(id, rows);
          }
        });
        queue.clear();
        queueing = null;
        resolve(result);
      })
    ));
  }

  async function refresh(query: CompiledQuery, id: QueryId) {
    queue.set(id, query);
    return dequeue().then((x) => x.get(id)!);
  }

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
    const { synced: version } = await db.selectVersion().execute();
    const client = await db.selectClient().execute();

    await push();
    hold = remotePull(
      { version, client },
      {
        async onData(changes) {
          if (!changes.length) return;
          await db.insertChanges(changes).execute();
          await trigger(changes, changes[0]);
        },
      }
    ).unsubscribe;
    globalThis.addEventListener?.("offline", hold);
  }

  async function update<T extends any[], R>(
    operation: Operation<T, R>,
    ...args: T
  ) {
    const db = await connection;
    const { changes, result } = await db
      .applyOperation(operation, ...args)
      .execute();
    await trigger(changes);
    return result;
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
    channel.close();
    listeners.clear();
    globalThis.removeEventListener?.("online", pull);
    globalThis.removeEventListener?.("offline", hold);
    channel.removeEventListener("message", tabUpdate);
    await connection.then((x) => x.destroy());
  }

  const bound: any = Object.assign(
    store.bind({ connection, subscribe, update, refresh } as any, []),
    {
      with: (...args: any[]) =>
        store.bind({ connection, subscribe, update, refresh } as any, args),
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
  const { connection, update, refresh: read } = this;
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

        id = { queryId: Math.random().toString(36).slice(2) };
        query = executor.compileQuery(executor.transformQuery(node, id), id);

        forget();
        forget = this.subscribe(tables, refresh);
      });
      unsubscribe = () => (stop(), forget());
    });

    return () => (unsubscribe?.(), (unsubscribe = null));
  });

  async function refresh() {
    await connection;
    if (!query || !id) return;
    set(await read<Type>(query, id));
  }

  const bound: Bound<Actions<Schema>> = {};
  for (const name in actions) {
    bound[name] = (...args: any[]) => update(actions[name], ...args);
  }

  return {
    ...bound,
    set,
    subscribe,
    update<T extends any[], R>(operation?: Operation<T, R>, ...args: T) {
      if (!operation) return refresh();
      return update(operation, ...args);
    },
    then(resolve: (x: Type[]) => any, reject: (e: any) => any) {
      let data: Type[] = [];
      const done = subscribe((x) => (data = x));
      // It is hard to know whether the current store's state is dirty,
      //   therefore we have to explicitly refresh it
      return refresh().then(() => (done(), resolve(data)), reject);
    },
  };
}

export { database };
