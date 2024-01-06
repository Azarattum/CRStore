<script lang="ts">
  import ReactDOM from "react-dom/client";
  import { Component } from "./Component";
  import { onMount } from "svelte";
  import React from "react";

  let root: HTMLDivElement;
  onMount(() => {
    ReactDOM.createRoot(root).render(React.createElement(Component));
  });
</script>

<div bind:this={root}></div>
