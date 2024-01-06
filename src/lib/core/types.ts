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

/** A set of changes that is encoded to be used over the wire */
type EncodedChanges = [string, ...(string | number | null)[]] | [];
type Change = {
  /** Client's unique identifier */
  site_id: Uint8Array;
  /** Column name */
  cid: string;
  /** Primary key */
  pk: Uint8Array;
  /** Table name */
  table: string;
  /** Value */
  val: string | number | Uint8Array | null;
  /** Lamport clock of the database for this change (used to track whether or not a client has seen changes from another database) */
  db_version: number;
  /** Lamport clock of the column for this change (used for merging) */
  col_version: number;
  /** Causal length (used for delete/insert tracking) */
  cl: number;
  /** Operation number in the current transaction */
  seq: number;
};

type QueryId = { queryId: string };
type Executable<T> = { execute(): Promise<T> };
type Updater = (changes: EncodedChanges, sender?: string) => any;
type Schema<T> = T extends { TYPE: infer U } ? U : unknown;

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
  ..._: Deps
) => Selectable<Type[]>;

type Context<Schema> = {
  update<T extends any[], R>(
    operation: Operation<T, R, Schema>,
    ...args: T
  ): Promise<R>;
  refresh<T = unknown>(
    query: CompiledQuery,
    id: { queryId: string },
  ): Promise<T[]>;
  subscribe(tables: string[], callback: () => any): () => void;
  connection: Promise<Kysely<Schema>>;
};

type CoreStore<S> = <T, A extends Actions<S>, D extends any[]>(
  dependencies: D,
  view: View<S, T, D>,
  actions?: A,
) => PromiseLike<T[]> &
  Bound<A> & {
    subscribe: (fn: (value: T[]) => void) => () => void;
    bind: (
      parameters: D | ((set: (updated: D) => void) => (() => void) | undefined),
    ) => void;
    update<T extends any[], R>(
      operation?: Operation<T, R, S>,
      ...args: T
    ): Promise<R>;
  };

// === DATABASE ===

type Error = ((reason: unknown) => void) | undefined;
type Push = ((changes: EncodedChanges) => any) | undefined;
type Pull =
  | ((
      input: { version: number; client: string },
      options: { onData: (changes: EncodedChanges) => any },
    ) => { unsubscribe(): void })
  | undefined;

interface Connection<S> extends Kysely<S> {
  selectVersion(): Executable<{ current: number; synced: number }>;
  resolveChanges(changes: EncodedChanges): Executable<EncodedChanges>;
  updateVersion(version?: number): Executable<any>;
  insertChanges(changes: EncodedChanges): Executable<void>;
  selectClient(): Executable<string>;
  changesSince(
    since: number,
    filter?: string | null,
  ): Executable<EncodedChanges>;
  applyOperation<T extends any[], R>(
    operation: Operation<T, R, S>,
    ...args: T
  ): Executable<{ result: Awaited<R>; changes: EncodedChanges }>;
}

interface CoreDatabase<S> {
  connection: Promise<Connection<S>>;
  store: CoreStore<S>;

  update<T extends any[], R>(
    operation: Operation<T, R, S>,
    ...args: T
  ): Promise<R>;
  merge(changes: EncodedChanges): Promise<void>;
  close(): Promise<void>;
  subscribe(
    tables: string[],
    callback: Updater,
    options?: {
      client: string;
      version: number;
    },
  ): () => void;
}

export type {
  EncodedChanges,
  CoreDatabase,
  Connection,
  CoreStore,
  Operation,
  QueryId,
  Actions,
  Context,
  Updater,
  Change,
  Kysely,
  Schema,
  Bound,
  Error,
  View,
  Push,
  Pull,
  Node,
};
