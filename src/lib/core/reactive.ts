const empty: [] = [];
const ready = (data: unknown[]) => data !== empty;

function reactive<T extends any[], U extends any[] = []>(
  start: (...args: U) => (() => void) | Promise<() => void>,
  parameters: U = [] as unknown as U,
) {
  type Subscriber = (value: T) => void;
  const subscribers = new Set<Subscriber>();
  const invalidator = {
    stop: undefined as (() => void) | undefined,
    start: undefined as
      | ((set: typeof invalidate) => (() => void) | undefined)
      | undefined,
  };

  let stop: (() => void) | Promise<() => void> | undefined;
  let value = empty as unknown as T;

  function set(updated: T) {
    value = updated;
    if (stop) subscribers.forEach((x) => x(value));
  }

  function subscribe(fn: Subscriber) {
    subscribers.add(fn);
    if (subscribers.size === 1) {
      stop = start(...parameters);
      invalidator.stop = invalidator.start?.(invalidate);
    }
    fn(value);
    return () => {
      subscribers.delete(fn);
      if (subscribers.size === 0 && stop) {
        Promise.resolve(stop).then((x) => x());
        stop = undefined;
        invalidator.stop?.();
        invalidator.stop = undefined;
      }
    };
  }

  function bind(fn: ((set: typeof invalidate) => () => void) | U) {
    if (Array.isArray(fn)) return invalidate(fn);
    invalidator.stop?.();
    invalidator.start = fn;
    if (stop) invalidator.stop = invalidator.start(invalidate);
  }

  function invalidate(updated: U) {
    if (JSON.stringify(updated) === JSON.stringify(parameters)) return;
    parameters = updated.slice() as U;
    if (!stop) return;
    Promise.resolve(stop).then((x) => x());
    stop = start(...parameters);
  }

  return { set, subscribe, bind };
}

export { reactive, ready };
