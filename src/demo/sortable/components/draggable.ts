import { position, type Point } from "./pointer";
import { createEffect } from "./Overlay.svelte";
import { lock, unlock } from "./touch";

export default function draggable(
  node: HTMLElement,
  {
    trigger = "touchstart",
    easing = "ease",
    duration = 300,
    mode = "self",
    axis = "both",
  }: DraggableOptions = {}
) {
  const element = (event: Event) => {
    let target = (
      mode === "children" ? event.target : node
    ) as HTMLElement | null;

    if (event instanceof DragEvent) return target;
    while (target && !target.draggable) {
      target = target?.parentElement || null;
    }

    return target;
  };

  const simulate = (event: any) => {
    lock();
    const { clientX, clientY } = event.changedTouches?.[0] || event;
    element(event)?.dispatchEvent(
      new DragEvent("dragstart", {
        clientX,
        clientY,
        bubbles: true,
      })
    );
  };

  function grab(event: DragEvent) {
    const target = element(event);
    if (!target?.draggable) return;
    event.preventDefault();

    const effect = createEffect(target);
    requestAnimationFrame(() => {
      effect.setAttribute("dragging", "true");
    });

    const initial = target.getBoundingClientRect();
    const offset = {
      x: axis === "y" ? 0 : event.clientX || 0,
      y: axis === "x" ? 0 : event.clientY || 0,
    };
    target.style.visibility = "hidden";
    target.draggable = false;

    const unsubscribe = position.subscribe(drag(effect, offset));
    const stopHandler = (event: Event) => {
      const callback = new Event("dragend", event) as DraggedEvent;
      callback.retract = (override) => {
        if (override === undefined) override = target;
        retract(override, effect, initial)();
      };

      node.dispatchEvent(callback);
      if (!callback.defaultPrevented) {
        requestAnimationFrame(() => {
          callback.retract();
        });
      }

      removeEventListener("pointercancel", stopHandler);
      removeEventListener("pointerup", stopHandler);
      unsubscribe();
    };

    addEventListener("pointercancel", stopHandler);
    addEventListener("pointerup", stopHandler);

    event.preventDefault = () => {
      stopHandler(event);
    };
  }

  function drag(effect: HTMLElement, offset: Point) {
    return ({ x, y }: Point) => {
      x = (axis === "y" ? 0 : x) - offset.x;
      y = (axis === "x" ? 0 : y) - offset.y;
      effect.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    };
  }

  function retract(
    target: HTMLElement | null,
    effect: HTMLElement,
    initial: Point
  ) {
    return () => {
      unlock();
      let props: PropertyIndexedKeyframes = { opacity: "0" };
      if (target && document.contains(target)) {
        const desired = target.getBoundingClientRect();
        const dx = desired.x - initial.x;
        const dy = desired.y - initial.y;
        props = { transform: `translate3d(${dx}px, ${dy}px, 0)` };
      }

      effect.removeAttribute("dragging");
      const animation = effect.animate(props, { duration, easing });
      const complete = () => {
        effect.remove();
        if (target) {
          target.style.visibility = "";
          target.draggable = true;
        }
        animation.removeEventListener("finish", complete);
        animation.removeEventListener("cancel", complete);
        animation.removeEventListener("remove", complete);
      };

      animation.addEventListener("finish", complete);
      animation.addEventListener("cancel", complete);
      animation.addEventListener("remove", complete);
    };
  }

  if (mode === "self") node.draggable = true;
  node.addEventListener(trigger, simulate);
  node.addEventListener("dragstart", grab);
  return {
    destroy() {
      node.removeEventListener(trigger, simulate);
      node.removeEventListener("dragstart", grab);
    },
  };
}

interface DraggableOptions {
  easing?: string;
  trigger?: string;
  duration?: number;
  axis?: "both" | "x" | "y";
  mode?: "self" | "children";
}

declare global {
  namespace svelte.JSX {
    // @ts-ignore
    interface HTMLAttributes {
      ondragend?: (event: DraggedEvent) => void;
    }
  }

  interface DraggedEvent extends Event {
    retract: (target?: HTMLElement | null) => void;
    canceled: boolean;
  }
}
