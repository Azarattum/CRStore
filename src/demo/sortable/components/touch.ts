let locked = false;

const prevent = (event: Event) => {
  if (locked) event.preventDefault();
};

const mitigate = ({ target }: { target: EventTarget | null }) => {
  if (!target) return;
  const cancel = () => {
    target.removeEventListener("touchend", cancel);
    target.removeEventListener("touchmove", prevent);
    target.removeEventListener("touchcancel", cancel);
  };
  target.addEventListener("touchmove", prevent, { passive: false });
  target.addEventListener("touchcancel", cancel, { once: true });
  target.addEventListener("touchend", cancel, { once: true });
};

globalThis.addEventListener?.("touchmove", prevent, { passive: false });
globalThis.addEventListener?.("touchstart", mitigate, { passive: true });

/**
 * Immediately locks touch move events
 */
export function lock() {
  locked = true;
}

/**
 * Unlocks touch events locked with `lock()`
 */
export function unlock() {
  locked = false;
}
