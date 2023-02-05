const derivatives = new WeakMap<object, object>();

/**
 * Derives a weakly mapped object symbol from the given object
 *  or a special string from other primitives.
 * Values derived the same number of times are guaranteed to be equal.
 */
export function derive(obj: any, times = 1): object | symbol {
  if (times <= 1) {
    if (typeof obj === "object" || typeof obj === "symbol") return obj;
    else return Symbol.for(String(obj));
  }

  if (typeof obj !== "object") {
    if (typeof obj === "symbol") obj = Symbol.keyFor(obj);
    else obj = String(obj);

    return derive(Symbol.for(obj + "\0"), times - 1);
  }

  let symbol = derivatives.get(obj);
  if (!symbol) {
    symbol = Object(Symbol()) as object;
    derivatives.set(obj, symbol);
  }

  return derive(symbol, times - 1);
}

/**
 * Efficiently slices an iterator into an array
 * @param iterator Iterator object
 * @param start Start index
 * @param end End index
 */
export function slice<T>(iterator: Iterator<T>, start: number, end: number) {
  if (!Number.isFinite(start) || !Number.isFinite(end)) return [];
  if (Number.isNaN(start) || Number.isNaN(end)) return [];
  if (start >= end) return [];

  const slice = new Array<T>(end - start);
  for (let i = 0; i < end; i++) {
    const { value, done } = iterator.next();
    if (i < start) continue;
    if (done) return slice.slice(0, i);
    slice[i - start] = value;
  }

  return slice;
}
