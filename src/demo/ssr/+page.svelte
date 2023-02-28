<script lang="ts">
  import type { PageData } from "./$types";
  import { items } from "./stores";

  export let data: PageData;

  function submit(this: HTMLFormElement) {
    const data = new FormData(this).get("data");
    if (data) items.add(data.toString());
  }
</script>

<form on:submit|preventDefault={submit}>
  <input type="text" name="data" /><button>+</button>
</form>

{#if $items.length}
  <ul>
    {#each $items as item}
      <li>{item.data}</li>
    {/each}
  </ul>
{:else}
  <!-- Loading... -->
  <ul>
    {#each data.data as item}
      <li>{item.data}</li>
    {/each}
  </ul>
{/if}
