<script lang="ts">
  import { createEventDispatcher, onDestroy } from "svelte";
  import { position } from "./pointer";
  import draggable from "./draggable";
  import { derive } from "./object";
  import { minmax } from "./math";
  import hold from "./hold";

  import Virtual from "./Virtual.svelte";

  export let items: any[];
  export let animation = 0;
  export let dragging = false;
  export let container: HTMLElement | null = null;
  export let attributes: Record<string, string> = {};
  export let identify = derive;

  export let scroll = 0;
  export let offset = 0;
  export let height = 0;
  export let wrapper: HTMLElement | null = null;

  let to = NaN;
  let from = NaN;
  let destroy = () => {};
  let bounds: { top: number; bottom: number } | undefined;
  const dispatch = createEventDispatcher<{
    sort: { from: number; to: number };
  }>();

  $: bounds = dragging ? container?.getBoundingClientRect() : undefined;
  $: pointer = bounds ? minmax($position.y, bounds.top, bounds?.bottom) : NaN;
  $: location = bounds ? pointer - bounds.top - offset + scroll : NaN;
  $: hovering = minmax(Math.floor(location / height), 0, items.length - 1);
  $: if (Number.isInteger(hovering)) swap();
  $: previous = hovering;
  $: if (wrapper) {
    destroy();
    const target = wrapper;

    const holdAction = hold(target);
    const dragAction = draggable(target, {
      duration: animation,
      mode: "children",
      trigger: "hold",
    });

    const enable = () => ((dragging = true), (from = NaN), (to = NaN));
    const disable = () =>
      (dragging = false) ||
      setTimeout(
        () =>
          Number.isNaN(from) ||
          Number.isNaN(to) ||
          from === to ||
          dispatch("sort", { from, to }),
        animation
      );
    target.addEventListener("dragend", disable);
    target.addEventListener("dragstart", enable);

    destroy = () => {
      dragAction.destroy();
      holdAction.destroy();
      target.removeEventListener("dragend", disable);
      target.removeEventListener("dragstart", enable);
    };
  }

  function swap() {
    if (Number.isNaN(previous)) return;
    if (Number.isNaN(from)) from = previous;
    to = hovering;
    const [item] = items.splice(previous, 1);
    items.splice(hovering, 0, item);
    requestAnimationFrame(() => (items = items));
  }

  onDestroy(destroy);
</script>

<Virtual
  {items}
  {identify}
  {animation}
  attributes={{ ...attributes, draggable: "true" }}
  bind:container
  bind:wrapper
  bind:scroll
  bind:offset
  bind:height
  let:index
  let:item
  let:key
>
  <slot {item} {index} {key} />
</Virtual>
