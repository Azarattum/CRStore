import { position, type Point } from "./pointer";

export default function autoscroll(
  node: HTMLElement,
  {
    axis = "both",
    threshold = 64,
    enabled = false,
    trigger = "auto",
  }: AutoScrollOptions = {}
) {
  let bounds: DOMRect;
  const direction = { x: 0, y: 0 };
  const enable = () => toggle(true);
  const disable = () => toggle(false);

  function update({ x, y }: Point) {
    if (!enabled) return;
    let dx = 0;
    let dy = 0;

    if (axis !== "x") {
      if (y - bounds.top < threshold) {
        dy = -(bounds.top - y + threshold);
      } else if (y > bounds.bottom - threshold) {
        dy = y - bounds.bottom + threshold;
      }
    }
    if (axis !== "y") {
      if (x - bounds.left < threshold) {
        dx = -(bounds.left - x + threshold);
      } else if (x > bounds.right - threshold) {
        dx = x - bounds.right + threshold;
      }
    }
    dy /= threshold;
    dx /= threshold;

    const wasZero = !direction.x && !direction.y;
    const isNotZero = dx || dy;
    direction.x = ease(dx);
    direction.y = ease(dy);

    if (wasZero && isNotZero) scroll();
  }

  function ease(value: number) {
    if (!value) return 0;
    let temp = Math.abs(value);
    if (temp < 1) temp = (Math.cos(Math.PI * (temp + 1)) + 1) / 2;
    else temp = Math.log(temp) / 3 + 1;

    return temp * Math.sign(value);
  }

  function scroll() {
    let then = Date.now();
    const scroll = () => {
      if (!enabled) return;
      if (!direction.x && !direction.y) return;
      const now = Date.now();
      const elapsed = now - then;
      then = now;

      node.scrollBy(direction.x * elapsed, direction.y * elapsed);
      requestAnimationFrame(scroll);
    };
    requestAnimationFrame(scroll);
  }

  let unsubscribe = () => {};
  function toggle(state = enabled) {
    enabled = state || trigger === "always";
    if (enabled) {
      bounds = node.getBoundingClientRect();
      unsubscribe = position.subscribe(update);
    } else {
      direction.x = 0;
      direction.y = 0;
      unsubscribe();
    }
  }

  if (trigger === "auto") {
    node.addEventListener("dragstart", enable);
    node.addEventListener("dragend", disable);
  }
  toggle();

  return {
    update(config: AutoScrollOptions) {
      if (config.enabled != null) toggle(config.enabled);
    },
    destroy() {
      node.removeEventListener("dragstart", enable);
      node.removeEventListener("dragend", disable);
      trigger = "none";
      toggle(false);
    },
  };
}

interface AutoScrollOptions {
  enabled?: boolean;
  threshold?: number;
  axis?: "both" | "x" | "y";
  trigger?: "auto" | "always" | "none";
}

declare global {
  namespace svelte.JSX {
    // @ts-ignore
    interface HTMLAttributes {
      autoscroll?: boolean | "true" | "false" | null;
    }
  }
}
