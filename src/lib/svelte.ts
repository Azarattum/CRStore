import type {
  Actions,
  Bound,
  CoreDatabase,
  Operation,
  Schema,
  View,
} from "./core/types";
import { derived, get, type Readable, type StoresValues } from "svelte/store";
import { database as coreDatabase } from "./core/crstore";
import type { CRSchema } from "./database/schema";

function database<S extends CRSchema>(
  schema: S,
  params: Parameters<typeof coreDatabase>[1] = {},
): SvelteDatabase<Schema<S>> {
  const { store: coreStore, ...rest } = coreDatabase(schema, params);

  function storeWith<D extends Readable<any>[]>(...deps: D) {
    return function store<T, A extends Actions<Schema<S>>>(
      view: View<Schema<S>, T, StoresValues<D>>,
      actions?: A,
    ) {
      const dependency = deps.length ? derived(deps, (x) => x) : null;
      const initial = dependency ? get(dependency) : ([] as StoresValues<D>);
      const { bind, ...rest } = coreStore(initial, view, actions);
      bind((update) => dependency?.subscribe(update));
      return rest;
    } as any as SvelteStore<Schema<S>, StoresValues<D>>;
  }

  return { store: Object.assign(storeWith(), { with: storeWith }), ...rest };
}

type SvelteStore<S, D extends any[] = []> = <T, A extends Actions<S>>(
  view: View<S, T, D>,
  actions?: A,
) => Readable<T[]> &
  PromiseLike<T[]> &
  Bound<A> & {
    update<T extends any[], R>(
      operation?: Operation<T, R, S>,
      ...args: T
    ): Promise<R>;
  };

type SvelteDatabase<S> = Omit<CoreDatabase<S>, "store"> & {
  store: SvelteStore<S> & {
    with<D extends Readable<any>[]>(
      ...stores: D
    ): SvelteStore<S, StoresValues<D>>;
  };
};

export { database };
