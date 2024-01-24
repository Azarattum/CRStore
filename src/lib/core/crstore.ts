import type {
  EncodedChanges,
  Operation,
  CoreDatabase,
  Actions,
  Context,
  Updater,
  QueryId,
  Schema,
  Bound,
  Error,
  Pull,
  Push,
  View,
} from "./types";
import { affectedTables } from "../database/operations";
import type { CRSchema } from "../database/schema";
import { defaultPaths, init } from "../database";
import { reactive, ready } from "./reactive";
import type { CompiledQuery } from "kysely";
import { queue } from "../database/queue";

function database<T extends CRSchema>(
  schema: T,
  {
    ssr = false,
    name = "crstore.db",
    paths = defaultPaths,
    error = undefined as Error,
    push: remotePush = undefined as Push,
    pull: remotePull = undefined as Pull,
    online = () => !!(globalThis as any).navigator?.onLine,
  } = {},
): CoreDatabase<Schema<T>> {
  const dummy = !ssr && !!import.meta.env?.SSR;
  const connection = dummy
    ? new Promise<never>(() => {})
    : init(name, schema, paths);
  const channel =
    "BroadcastChannel" in globalThis
      ? new globalThis.BroadcastChannel(`${name}-sync`)
      : null;
  const tabUpdate = (event: MessageEvent) => trigger(event.data, event.data[0]);
  const write = queue(connection, trigger);
  const read = queue(connection);

  channel?.addEventListener("message", tabUpdate);
  globalThis.addEventListener?.("online", pull);

  const listeners = new Map<string, Set<Updater>>();
  let hold = () => {};
  pull();

  async function refresh(query: CompiledQuery, id: QueryId) {
    return read
      .enqueue(id, (db) => db.getExecutor().executeQuery(query, id))
      .then((x) => x.rows);
  }

  function subscribe(
    tables: string[],
    callback: Updater,
    options?: { client: string; version: number },
  ) {
    const listener = async (changes: EncodedChanges, sender?: string) => {
      try {
        if (options && options.client === sender) return;
        await callback(changes, sender);
      } catch (reason) {
        error?.(reason);
      }
    };

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
        if (changes.length) listener(changes);
      });
    } else listener("");

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
      },
    ).unsubscribe;
    globalThis.addEventListener?.("offline", hold);
  }

  async function update<T extends any[], R>(
    operation: Operation<T, R>,
    ...args: T
  ) {
    return write.enqueue({}, operation, ...args);
  }

  async function merge(changes: EncodedChanges) {
    if (!changes.length) return;
    const db = await connection;
    await trigger(await db.resolveChanges(changes).execute(), changes[0]);
  }

  async function trigger(changes: EncodedChanges, sender?: string) {
    if (!changes.length) return;
    const callbacks = new Set<Updater>();
    const tables = affectedTables(changes);

    listeners.get("*")?.forEach((x) => callbacks.add(x));
    tables.forEach((table) =>
      listeners.get(table)?.forEach((x) => callbacks.add(x)),
    );

    const promises = [...callbacks].map((x) => x(changes, sender));
    if (!sender) {
      channel?.postMessage(changes);
      await push();
    }

    await Promise.all(promises);
  }

  async function close() {
    hold();
    channel?.close();
    listeners.clear();
    globalThis.removeEventListener?.("online", pull);
    globalThis.removeEventListener?.("offline", hold);
    channel?.removeEventListener("message", tabUpdate);
    await connection.then((x) => x.destroy());
  }

  return {
    close,
    merge,
    update,
    subscribe,
    connection,
    replica: store.bind({
      connection,
      subscribe,
      update,
      refresh,
    } as any) as any,
  };
}

function store<Schema, Type>(
  this: Context<Schema>,
  view: View<Schema, Type>,
  actions: Actions<Schema> = {},
  dependencies: unknown[] = [],
) {
  const { connection, update, refresh: read } = this;

  let query = null as CompiledQuery | null;
  let id = null as QueryId | null;

  const { subscribe, set, bind } = reactive<Type[], typeof dependencies>(
    async (...values) => {
      const db = await connection;
      const node = view(db, ...(values as [])).toOperationNode();
      const tables = affectedTables(node);
      const executor = db.getExecutor();

      id = { queryId: Math.random().toString(36).slice(2) };
      query = executor.compileQuery(executor.transformQuery(node, id), id);

      return this.subscribe(tables, refresh);
    },
    dependencies,
  );

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
    subscribe,
    bind,
    update<T extends any[], R>(operation?: Operation<T, R>, ...args: T) {
      if (!operation) return refresh();
      return update(operation, ...args);
    },
    then(resolve?: (x: Type[]) => any, reject?: (e: any) => any) {
      let data: Type[] = [];
      const done = subscribe((x) => (data = x));
      // It is hard to know whether the current store's state is dirty,
      //   therefore we have to explicitly refresh it
      return refresh().then(() => (done(), resolve?.(data)), reject);
    },
  };
}

export { database, ready };
