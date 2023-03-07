import type { Readable, Writable } from "svelte/store";
import type {
  AggregateFunctionNode,
  SelectQueryNode,
  ReferenceNode,
  SelectAllNode,
  CompiledQuery,
  ColumnNode,
  TableNode,
  AliasNode,
  RawNode,
  Kysely,
} from "kysely";

// === UTILITIES ===

type QueryId = { queryId: string };
type Executable<T> = { execute(): Promise<T> };
type Updater = (changes: any[], sender?: string) => any;
type Schema<T> = T extends { TYPE: infer U } ? U : unknown;
type Values<T> = { [K in keyof T]: T[K] extends Readable<infer V> ? V : T[K] };

type Operation<T extends any[], R = void, S = any> = (
  db: Kysely<S>,
  ...args: T
) => Promise<R>;

type Selectable<T> = {
  execute(): Promise<T>;
  compile(): CompiledQuery;
  toOperationNode(): SelectQueryNode;
};

type Actions<Schema> = Record<
  string,
  (db: Kysely<Schema>, ...args: any[]) => Promise<any>
>;

type Bound<Actions> = {
  [K in keyof Actions]: Actions[K] extends (
    db: Kysely<any>,
    ...args: infer A
  ) => infer R
    ? (...args: A) => Promise<Awaited<R>>
    : never;
};

type Node =
  | SelectQueryNode
  | TableNode
  | ColumnNode
  | ReferenceNode
  | RawNode
  | AggregateFunctionNode
  | AliasNode
  | SelectAllNode;

// === STORE ===

type View<Schema, Type, Deps extends any[] = []> = (
  db: Kysely<Schema>,
  ..._: Values<Deps>
) => Selectable<Type[]>;

type Context<Schema> = {
  update<T extends any[], R>(
    operation: Operation<T, R, Schema>,
    ...args: T
  ): Promise<R>;
  refresh<T = unknown>(
    query: CompiledQuery,
    id: { queryId: string }
  ): Promise<T[]>;
  subscribe(tables: string[], callback: () => any): () => void;
  connection: Promise<Kysely<Schema>>;
};

type Store<S, D extends Readable<any>[] = []> = <T, A extends Actions<S>>(
  view: View<S, T, D>,
  actions?: A
) => Omit<Writable<T[]>, "update"> &
  Bound<A> & {
    update<T extends any[], R>(
      operation?: Operation<T, R, S>,
      ...args: T
    ): Promise<R>;
    then(resolve: (x: T[]) => void): void;
  };

// === DATABASE ===

type Push = ((changes: any[]) => any) | undefined;
type Pull =
  | ((
      input: { version: number; client: string },
      options: { onData: (changes: any[]) => any }
    ) => { unsubscribe(): void })
  | undefined;

interface Connection<S> extends Kysely<S> {
  changesSince(since: number, filter?: string | null): Executable<any[]>;
  selectVersion(): Executable<{ current: number; synced: number }>;
  resolveChanges(changes: any[]): Executable<any[]>;
  updateVersion(version?: number): Executable<any>;
  insertChanges(changes: any[]): Executable<void>;
  selectClient(): Executable<string>;

  applyOperation<T extends any[], R>(
    operation: Operation<T, R, S>,
    ...args: T
  ): Executable<{ result: Awaited<R>; changes: any[] }>;
}

interface Database<S> {
  connection: Promise<Connection<S>>;
  store: Store<S> & {
    with<D extends Readable<any>[]>(...stores: D): Store<S, D>;
  };

  update<T extends any[], R>(
    operation: Operation<T, R, S>,
    ...args: T
  ): Promise<R>;
  merge(changes: any[]): Promise<void>;
  close(): Promise<void>;
  subscribe(
    tables: string[],
    callback: Updater,
    options?: {
      client: string;
      version: number;
    }
  ): () => void;
}

export type {
  Connection,
  Operation,
  Database,
  QueryId,
  Actions,
  Context,
  Updater,
  Kysely,
  Schema,
  Bound,
  View,
  Push,
  Pull,
  Node,
};
