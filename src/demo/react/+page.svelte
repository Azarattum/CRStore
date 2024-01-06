<script lang="ts">
  import ReactDOM from "react-dom/client";
  import { Component } from "./Component";
  import { onMount } from "svelte";

  let root: HTMLDivElement;
  onMount(() => {
    ReactDOM.createRoot(root).render(Component({}));
  });
</script>

<div bind:this={root}></div>
