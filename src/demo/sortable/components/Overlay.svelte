<script context="module" lang="ts">
  let reference: HTMLElement | undefined;

  export function createEffect(from: HTMLElement) {
    if (!reference) throw new Error("No overlay on the page!");
    const bounds = from.getBoundingClientRect();
    const style = {
      position: "absolute",
      top: `${bounds.top}px`,
      left: `${bounds.left}px`,
      width: `${bounds.width}px`,
      height: `${bounds.height}px`,
      transform: `translate3d(0, 0, 0)`,
      willChange: "transform",
      pointerEvents: "none",
    };

    const effect = document.createElement("div");
    Object.assign(effect.style, style);
    effect.appendChild(copyElement(from));

    return reference.appendChild(effect);
  }

  function copyElement(element: HTMLElement) {
    const copied = element.cloneNode(true) as HTMLElement;
    const margins = getBuggedMargins(element);
    // Fix Safari broken styles (recompute)
    if (/apple/i.test(navigator.vendor)) {
      const walker = document.createTreeWalker(copied, NodeFilter.SHOW_ELEMENT);
      while (walker.nextNode()) (walker.currentNode as any).style;
    }

    copied.style.margin = "0";
    if (margins.top) {
      const first = copied.firstElementChild as HTMLElement | undefined;
      if (first) first.style.marginTop = "0";
    }
    if (margins.bottom) {
      const last = copied.lastElementChild as HTMLElement | undefined;
      if (last) last.style.marginBottom = "0";
    }

    return copied;
  }

  function getBuggedMargins(element: HTMLElement) {
    let top = true;
    let bottom = true;

    const style = getComputedStyle(element);
    if (style.borderTopStyle !== "none") top = false;
    if (style.borderBottomStyle !== "none") bottom = false;
    if (Number.parseFloat(style.paddingTop) > 0) top = false;
    if (Number.parseFloat(style.paddingBottom) > 0) bottom = false;
    const overflows = ["auto", "overlay", "scroll"];
    const displays = ["flex", "grid", "flow-root"];
    if (
      overflows.includes(style.overflowY) ||
      displays.includes(style.display)
    ) {
      top = false;
      bottom = false;
    }

    return { top, bottom };
  }
</script>

<script lang="ts">
  import { onDestroy, onMount } from "svelte";

  let frame: HTMLIFrameElement;
  onMount(() => {
    if (reference) throw new Error("There can be only one overlay!");
    if (!frame.contentDocument) return;
    reference = frame.contentDocument.body;

    frame.contentDocument.documentElement.id = "overlay";
    document.querySelectorAll('style, link[rel="stylesheet"]').forEach((x) => {
      frame.contentDocument?.head?.appendChild(x.cloneNode(true));
    });
  });

  onDestroy(() => {
    reference = undefined;
  });
</script>

<aside>
  <iframe bind:this={frame} title="Overlay" frameborder="0" scrolling="no" />
</aside>

<style>
  aside {
    position: fixed;
    top: 0;
    left: 0;

    z-index: 9999;
    pointer-events: none;
  }

  iframe {
    width: 100vw;
    height: 100vh;
  }

  :global(#overlay, #overlay > *) {
    background-color: transparent;
  }

  /** 
   * Fixes Safari bug with invisible iframe capturing scroll
   * using differences in stacking context behaviors
   */
  @media not all and (min-resolution: 0.001dpcm) {
    aside {
      z-index: -1;
      transform: translateZ(1px);
    }
  }
</style>
