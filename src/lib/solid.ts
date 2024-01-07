import type {
  CoreDatabase,
  Actions,
  Update,
  Schema,
  Bound,
  View,
} from "./core/types";
import { createSignal, createEffect, onCleanup } from "solid-js";
import { database as coreDatabase } from "./core/crstore";
import type { CRSchema } from "./database/schema";
import type { Accessor } from "solid-js";

function database<S extends CRSchema>(
  schema: S,
  params: Parameters<typeof coreDatabase>[1] = {},
): SolidDatabase<Schema<S>> {
  const { store: coreStore, ...rest } = coreDatabase(schema, params);

  function createStore<
    T,
    A extends Actions<Schema<S>>,
    D extends Accessor<any>[],
  >(
    view: View<Schema<S>, T, SignalValues<D>>,
    actions?: A,
    deps: D = [] as unknown as D,
  ) {
    const [data, setData] = createSignal<T[]>([]);
    const { bind, subscribe, ...rest } = coreStore(
      deps.map((x) => x()) as SignalValues<D>,
      view,
      actions,
    );

    createEffect(() => onCleanup(subscribe(setData)));
    createEffect(() => bind(deps.map((x) => x()) as SignalValues<D>));

    return Object.assign(data, rest);
  }

  return { createStore: createStore as any as SolidStore<Schema<S>>, ...rest };
}

type SolidStore<S> = <T, A extends Actions<S>, D extends Accessor<any>[] = []>(
  view: View<S, T, SignalValues<D>>,
  actions?: A,
  deps?: D,
) => Accessor<T[]> & Bound<A> & Update<S>;

type SolidDatabase<S> = Omit<CoreDatabase<S>, "store"> & {
  createStore: SolidStore<S>;
};

type SignalValues<T> = {
  [K in keyof T]: T[K] extends Accessor<infer U> ? U : never;
};

export { database };
