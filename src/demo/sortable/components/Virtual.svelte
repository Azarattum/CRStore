<script lang="ts">
  import { afterUpdate, onDestroy, onMount, tick } from "svelte";
  import { derive, slice as take } from "./object";
  import { finitify, minmax } from "./math";

  export let items: any[];
  export let animation = 0;
  export let container: HTMLElement | null = null;
  export let attributes: Record<string, string> = {};

  export let scroll = 0;
  export let offset = 0;
  export let height = 0;
  export let wrapper: HTMLElement | null = null;
  export let identify = derive;

  type Item = { index: number; item: any; key: object | symbol };

  let destroy = () => {};
  let viewport = 0;

  const buffer = 2;
  const elements: HTMLElement[] = [];
  const event = new Event("reflow", {});
  const observer = new ResizeObserver(resize);
  const resizer = (e: Event) => e === event || resize();
  const scroller = () => container && (scroll = container.scrollTop);

  $: count = finitify(Math.ceil(viewport / height)) + buffer * 2;
  $: pivot = ~~((scroll - offset) / height) - buffer;
  $: start = minmax(pivot, 0, items.length - count);
  $: end = start + count;
  $: translate = start * height;
  $: scale = items.length * height;
  $: indexed = index(items);
  $: slice = take(indexed.values(), start, end);
  $: if (scale) tick().then(() => container?.dispatchEvent(event));
  $: if (container) {
    destroy();
    const target = container;

    observer.observe(target);
    target.addEventListener("reflow", resizer);
    target.addEventListener("scroll", scroller, { passive: true });

    destroy = () => {
      observer.disconnect();
      target.removeEventListener("reflow", resizer);
      target.removeEventListener("scroll", scroller);
    };
  }

  function index(updated: any[]) {
    const counts = new Map<any, number>();
    const reindexed = new Map<any, Item>();
    for (let index = 0; index < updated.length; index++) {
      const item = updated[index];
      const count = (counts.get(item) || 0) + 1;
      const key = identify(item, count);
      reindexed.set(key, { item, index, key });
      counts.set(item, count);

      if (animation && index >= start && index < end) {
        const before = indexed?.get(key);
        if (!before) continue;
        const difference = before.index - index;
        animate(elements[before.index - start], difference);
      }
    }

    return reindexed;
  }

  function animate(element: HTMLElement | undefined, delta: number) {
    if (!element || !delta) return;
    if (element.style.visibility === "hidden") return;
    const transform = [
      `translate3d(0,${delta * 100}%,0)`,
      `translate3d(0,0,0)`,
    ];

    element.animate(
      { transform },
      {
        easing: "ease",
        duration: animation,
        composite: "accumulate",
      },
    );
    // Fix Safari animation (recompute styles)
    if (/apple/i.test(navigator.vendor)) element.style;
  }

  function resize() {
    if (!container || !wrapper) return;
    const inner = wrapper.getBoundingClientRect();
    const outer = container.getBoundingClientRect();

    viewport = outer.height;
    offset = inner.y - outer.y + container.scrollTop;
  }

  onMount(() => {
    if (container === null) container = wrapper?.parentElement || null;
    if (!container) throw new Error("Virtual list needs a container element!");
  });

  afterUpdate(() => {
    if (height || !elements[0]) return;
    height = elements[0].offsetHeight;
  });

  onDestroy(destroy);
</script>

<section bind:this={wrapper} style:height="{scale}px">
  <ul style:transform="translate3d(0,{translate}px,0)">
    {#each slice as item, i (item.key)}
      <li bind:this={elements[i]} {...attributes}>
        <slot {...item} />
      </li>
    {/each}
  </ul>
</section>

<style>
  section {
    contain: strict;
  }
  ul {
    margin: 0;
    padding: 0;
    contain: content;
    will-change: transform;
  }
  li {
    overflow-anchor: none;
    display: flow-root;
    appearance: auto;
  }
</style>
