import type {
  CoreDatabase,
  Actions,
  Schema,
  Update,
  Bound,
  View,
} from "./core/types";
import { database as coreDatabase } from "./core/crstore";
import { useState, useMemo, useEffect } from "react";
import type { CRSchema } from "./database/schema";

function database<S extends CRSchema>(
  schema: S,
  params: Parameters<typeof coreDatabase>[1] = {},
): ReactDatabase<Schema<S>> {
  const { store: coreStore, ...rest } = coreDatabase(schema, params);

  function useReplica<T, A extends Actions<Schema<S>>, D extends any[]>(
    view: View<Schema<S>, T, D>,
    actions?: A,
    deps: D = [] as unknown as D,
  ) {
    const [data, setData] = useState<T[]>([]);
    const { bind, subscribe, ...rest } = useMemo(
      () => coreStore(deps, view, actions),
      [],
    );

    useEffect(() => subscribe(setData), []);
    useEffect(() => bind(deps), deps);

    const compound = useMemo(() => Object.assign(data, rest), [data]);
    return compound;
  }

  return { useReplica: useReplica as any as ReactStore<Schema<S>>, ...rest };
}

type ReactStore<S> = <T, A extends Actions<S>, D extends any[] = []>(
  view: View<S, T, D>,
  actions?: A,
  deps?: D,
) => T[] & Bound<A> & Update<S>;

type ReactDatabase<S> = Omit<CoreDatabase<S>, "store"> & {
  useReplica: ReactStore<S>;
};

export { database };
