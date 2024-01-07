<script lang="ts">
  import type { PageData } from "./$types";
  import { items } from "./stores";
  import { ready } from "$lib";

  export let data: PageData;

  function submit(this: HTMLFormElement) {
    const data = new FormData(this).get("data");
    if (data) items.add(data.toString());
  }
</script>

<form on:submit|preventDefault={submit}>
  <input type="text" name="data" /><button>+</button>
</form>

<ul>
  {#each ready($items) ? $items : data.ssr as item}
    <li>{item.data}</li>
  {/each}
</ul>
