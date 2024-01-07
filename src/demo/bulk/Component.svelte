<script context="module">
  const schema = object({
    bulk: primary(object({ id: number() }), "id"),
  });

  const { replicated, update } = database(schema, {
    name: "bulk.db",
  });

  update((db) =>
    db
      .insertInto("bulk")
      .onConflict((qb) => qb.doNothing())
      .values({ id: 42 })
      .execute(),
  );
</script>

<script lang="ts">
  import { number, object } from "superstruct";
  import { database } from "$lib/svelte";
  import { primary } from "$lib";

  export let i: number;

  const data = replicated((db) => db.selectFrom("bulk").selectAll());
</script>

<span>
  {#if $data[0]}
    {$data[0].id}
    {(i === 99 && console.timeEnd("Time to Render"), "")}
  {:else}
    ?
    {(i === 0 && console.time("Time to Render"), "")}
  {/if}
  &nbsp;
</span>
