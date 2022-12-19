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
import type { Readable } from "svelte/store";

// === UTILITIES ===

type Executable<T> = { execute(): Promise<T> };
type Updater = (changes: any[], sender?: string) => any;
type Schema<T> = T extends { TYPE: infer U } ? U : unknown;
type Operation<T extends any[], S = any> = (db: Kysely<S>, ...args: T) => any;
type Values<T> = { [K in keyof T]: T[K] extends Readable<infer V> ? V : T[K] };

type Selectable<T> = {
  execute(): Promise<T>;
  compile(): CompiledQuery;
  toOperationNode(): SelectQueryNode;
};

type Actions<Schema> = Record<
  string,
  (db: Kysely<Schema>, ...args: any[]) => any
>;

type Bound<Actions> = {
  [K in keyof Actions]: Actions[K] extends (
    db: Kysely<any>,
    ...args: infer A
  ) => any
    ? (...args: A) => Promise<void>
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
  update<T extends any[]>(operation: Operation<T>, ...args: T): Promise<void>;
  subscribe: (tables: string[], callback: () => any) => () => void;
  connection: Promise<Kysely<Schema>>;
};

type Store<S, D extends Readable<any>[] = []> = <T, A extends Actions<S>>(
  view: View<S, T, D>,
  actions?: A
) => Readable<T[]> &
  Bound<A> & {
    update: <T, A extends any[]>(
      operation?: Operation<A, S>,
      ...args: A
    ) => Promise<T>;
  };

// === DATABASE ===

type Push = ((changes: any[]) => any) | undefined;
type Pull =
  | ((
      version: number,
      client: string,
      callback: (changes: any[]) => any
    ) => () => any)
  | undefined;

interface Connection<S> extends Kysely<S> {
  selectVersion(): Executable<{ current: number; synced: number }>;
  resolveChanges(changes: any[]): Executable<any[]>;
  updateVersion(version?: number): Executable<any>;
  insertChanges(changes: any[]): Executable<void>;
  selectClient(): Executable<string>;

  changesSince(
    since: number,
    operator?: "=" | "!=",
    client?: string
  ): Executable<any[]>;

  applyOperation<T extends any[]>(
    operation: Operation<T>,
    ...args: T
  ): Executable<any[]>;
}

interface Database<S> {
  connection: Promise<Connection<S>>;
  store: Store<S> & {
    with<D extends Readable<any>[]>(...stores: D): Store<S, D>;
  };

  update<T extends any[]>(operation: Operation<T>, ...args: T): Promise<void>;
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
  Actions,
  Context,
  Updater,
  Schema,
  Bound,
  View,
  Push,
  Pull,
  Node,
};
