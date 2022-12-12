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
    update: <T>(operation?: (db: Kysely<Schema<S>>) => Query<T>) => Promise<T>;
  };

type View<Schema, Type> = (db: Kysely<Schema>) => Query<Type[]>;

type Actions<Schema> = Record<
  string,
  (db: Kysely<Schema>, ...args: any[]) => Query<any>
>;

type Bound<Actions> = {
  [K in keyof Actions]: Actions[K] extends (
    db: Kysely<any>,
    ...args: infer A
  ) => Query<infer R>
    ? (...args: A) => Promise<R>
    : never;
};

type Context<Schema> = {
  connection: Promise<Kysely<Schema>>;
  subscribe: (tables: string[], callback: () => any) => () => void;
  trigger: (tables: string[]) => void;
};

export type { Schema, Store, View, Actions, Bound, Context, Query };
