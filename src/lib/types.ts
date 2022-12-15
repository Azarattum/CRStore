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
import type { CRSchema } from "./database/schema";
import type { Readable } from "svelte/store";

type Schema<T> = T extends { TYPE: infer U } ? U : unknown;
type Executable<T = any> = { execute(): T };
type Selectable<T> = {
  execute(): Promise<T>;
  toOperationNode(): SelectQueryNode;
};

type Store<S extends CRSchema> = <T, A extends Actions<Schema<S>>>(
  view: View<Schema<S>, T>,
  actions?: A
) => Readable<T[]> &
  Bound<A> & {
    update: <T, A extends any[]>(
      operation?: Operation<A, Schema<S>>,
      ...args: A
    ) => Promise<T>;
  };

type View<Schema, Type> = (db: Kysely<Schema>) => Selectable<Type[]>;

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
