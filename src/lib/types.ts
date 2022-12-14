import type { CompiledQuery, Kysely } from "kysely";
import type { CRSchema } from "./database/schema";
import type { Readable } from "svelte/store";

type Schema<T> = T extends { TYPE: infer U } ? U : unknown;
type Query<T> = { execute(): Promise<T>; compile(): CompiledQuery };

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

type View<Schema, Type> = (db: Kysely<Schema>) => Query<Type[]>;

type Actions<Schema> = Record<
  string,
  (db: Kysely<Schema>, ...args: any[]) => Query<any> | Query<any>[]
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
) => { execute(): unknown } | { execute(): unknown }[];

export type {
  Operation,
  Actions,
  Context,
  Updater,
  Schema,
  Store,
  Bound,
  Query,
  View,
  Push,
  Pull,
};
