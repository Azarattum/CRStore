<script lang="ts">
  import { writable } from "svelte/store";
  import { database } from "$lib/svelte";
  import { trpc } from "../../client";
  import { schema } from "../schema";

  const { replicated } = database(schema, {
    name: "frameworks.db",
    push: trpc.frameworks.push.mutate,
    pull: trpc.frameworks.pull.subscribe,
  });

  const filter = writable("");
  const items = replicated.with(filter)(
    (db, filter) =>
      db
        .selectFrom("items")
        .where("text", "like", filter + "%")
        .selectAll(),
    {
      create(db, text: string) {
        return db.insertInto("items").values({ text }).execute();
      },
    },
  );

  function handleCreate(
    e: KeyboardEvent & { currentTarget: HTMLInputElement },
  ) {
    if (e.code === "Enter") items.create(e.currentTarget.value);
  }
</script>

<h1>Svelte</h1>
<ol>
  {#each $items as x}
    <li>{x.text}</li>
  {/each}
</ol>
<input type="text" placeholder="Create" on:keydown={handleCreate} />
<input type="text" placeholder="Filter" bind:value={$filter} />
