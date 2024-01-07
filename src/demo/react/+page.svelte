<script lang="ts">
  import ReactDOM from "react-dom/client";
  import { onMount } from "svelte";
  import React from "react";

  let root: HTMLDivElement;
  onMount(async () => {
    const { Component } = await import("./React");
    ReactDOM.createRoot(root).render(React.createElement(Component));
  });
</script>

<div bind:this={root}></div>
