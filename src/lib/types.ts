import type {
  AggregateFunctionNode,
  SelectQueryNode,
  ReferenceNode,
  SelectAllNode,
  ColumnNode,
  TableNode,
  AliasNode,
  RawNode,
  Kysely,
} from "kysely";
import type { Readable } from "svelte/store";

type Schema<T> = T extends { TYPE: infer U } ? U : unknown;
type Executable<T = any> = { execute(): T };
type Selectable<T> = {
  execute(): Promise<T>;
  toOperationNode(): SelectQueryNode;
};

type Extended<S> = Store<Schema<S>> & {
  with<D extends Readable<any>[]>(...stores: D): Store<Schema<S>, D>;
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

type Values<T> = { [K in keyof T]: T[K] extends Readable<infer V> ? V : T[K] };
type View<Schema, Type, Deps extends any[] = []> = (
  db: Kysely<Schema>,
  ..._: Values<Deps>
) => Selectable<Type[]>;

type Actions<Schema> = Record<
  string,
  (db: Kysely<Schema>, ...args: any[]) => Executable | Executable[]
>;

type Bound<Actions> = {
  [K in keyof Actions]: Actions[K] extends (
    db: Kysely<any>,
    ...args: infer A
  ) => any
    ? (...args: A) => Promise<void>
    : never;
};

type Context<Schema> = {
  connection: Promise<Kysely<Schema>>;
  subscribe: (tables: string[], callback: () => any) => () => void;
  trigger: (changes: any[]) => void;
};

type Push = ((changes: any[]) => any) | undefined;
type Pull =
  | ((
      version: number,
      client: string,
      callback: (changes: any[]) => any
    ) => () => any)
  | undefined;

type Updater = (changes: any[], sender?: string) => any;

type Operation<T extends any[], S = any> = (
  db: Kysely<S>,
  ...args: T
) => Executable | Executable[];

type Node =
  | SelectQueryNode
  | TableNode
  | ColumnNode
  | ReferenceNode
  | RawNode
  | AggregateFunctionNode
  | AliasNode
  | SelectAllNode;

export type {
  Operation,
  Extended,
  Actions,
  Context,
  Updater,
  Schema,
  Store,
  Bound,
  View,
  Push,
  Pull,
  Node,
};
