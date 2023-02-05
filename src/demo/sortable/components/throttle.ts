type Func = (..._: any) => any;

/**
 * Returns a throttled function with respect to animation frames or a specified delay.
 * Typically used to throttle executions of input events handlers.
 *
 * Example:
 * ```
 * addEventListener("pointermove", throttle(handler));
 * ```
 */
export function throttle<T extends Func>(func: T, delay?: number) {
  let id: number;
  let context: any;
  let parameters: any;
  let time = Date.now() - (delay || 0 + 1);

  function callId() {
    func.apply(context, parameters);
    id = 0;
  }

  function callTime() {
    func.apply(context, parameters);
    time = Date.now();
  }

  if (delay === undefined) {
    return function (this: any, ...args: any) {
      context = this;
      parameters = args;

      if (id) return;
      id = requestAnimationFrame(callId);
    } as T;
  } else {
    return function (this: any, ...args: any) {
      context = this;
      parameters = args;

      clearTimeout(id);
      id = +setTimeout(callTime, delay - (Date.now() - time));
    } as T;
  }
}

/**
 * Returns a debounced function.
 *
 * Example:
 * ```
 * addEventListener("input", debounce(handler, 200));
 * ```
 */
export function debounce<T extends Func>(func: T, delay = 300) {
  let id: number;
  return function (this: any, ...args: any) {
    clearTimeout(id);
    id = +setTimeout(() => {
      func.apply(this, args);
    }, delay);
  } as T;
}

/**
 * Provides a promise-based delay using setTimeout function.
 * @param duration Delay duration
 */
export function delay(duration: number) {
  return new Promise((resolve) => setTimeout(resolve, duration));
}
