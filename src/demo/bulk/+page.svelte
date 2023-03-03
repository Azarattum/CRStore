<script>
  import Component from "./Component.svelte";
</script>

{#each Array.from({ length: 100 }).map((_, i) => i) as _}
  <Component i={_} />
{/each}
