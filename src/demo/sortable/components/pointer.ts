import { throttle } from "./throttle";
import { readable } from "svelte/store";

export type Point = { x: number; y: number };

/**
 * A readable store of the current pointer (mouse/touch)
 *  position (clientX, clientY).
 */
export const position = readable<Point>({ x: NaN, y: NaN }, (set) => {
  const update = throttle(({ x, y }: Point) => set({ x, y }));
  globalThis.addEventListener?.("pointermove", update);
  globalThis.addEventListener?.("pointerdown", update);

  return function stop() {
    globalThis.removeEventListener?.("pointermove", update);
    globalThis.removeEventListener?.("pointerdown", update);
  };
});
