<script lang="ts">
  import type { PageData } from "./$types";
  import { items } from "./stores";

  export let data: PageData;
  $items = data.initial;

  function submit(this: HTMLFormElement) {
    const data = new FormData(this).get("data");
    if (data) items.add(data.toString());
  }
</script>

<form on:submit|preventDefault={submit}>
  <input type="text" name="data" /><button>+</button>
</form>

<ul>
  {#each $items as item}
    <li>{item.data}</li>
  {/each}
</ul>
