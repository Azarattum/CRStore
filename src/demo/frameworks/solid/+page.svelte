<script lang="ts">
  import { render as solidRender } from "solid-js/web";
  import { onMount } from "svelte";

  let root: HTMLDivElement;
  onMount(async () => {
    const { Component } = await import("./Solid");
    solidRender(Component as any, root);
  });
</script>

<div bind:this={root}></div>
