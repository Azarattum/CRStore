<script lang="ts">
  import { database, json, PREPEND, APPEND } from "$lib";
  import Sortable from "./components/Sortable.svelte";
  import Overlay from "./components/Overlay.svelte";
  import { onDestroy } from "svelte";
  import { schema } from "./schema";
  import { trpc } from "../client";

  const { store, close } = database(schema, {
    push: (changes) => trpc.sortable.push.mutate(changes),
    pull: (version, client, onData) =>
      trpc.sortable.pull.subscribe({ version, client }, { onData }).unsubscribe,
  });
  onDestroy(close);

  const hash = (s: string) =>
    s.split("").reduce((a, b) => {
      a = (a << 5) - a + b.charCodeAt(0);
      return a & a;
    }, 0);

  const lists = store(
    (db) =>
      db
        .selectFrom((qb) =>
          qb
            .selectFrom("items")
            .innerJoin("lists", "lists.id", "items.list")
            .selectAll()
            .orderBy("order")
            .orderBy("id")
            .as("data")
        )
        .select([
          "title",
          (qb) =>
            json(qb, {
              id: "id",
              data: "data",
              order: "order",
            }).as("items"),
        ])
        .groupBy("list"),
    {
      async add(db, list: string, item: string, append = true) {
        await db
          .insertInto("lists")
          .onConflict((qb) => qb.doNothing())
          .values({ id: hash(list), title: list })
          .execute();
        await db
          .insertInto("items")
          .onConflict((qb) => qb.doNothing())
          .values({
            id: hash(item),
            data: item,
            list: hash(list),
            order: append ? APPEND : PREPEND,
          })
          .execute();
      },
      async move(db, list: number, from: number, to: number) {
        const source = $lists[list].items[from];
        const target = $lists[list].items[to - (to < from ? 1 : 0)];
        await db
          .updateTable("items_fractindex" as any)
          .set({ after_id: target?.id || null })
          .where("id", "=", source.id)
          .execute();
      },
    }
  );

  let list = "";
  let item = "";
</script>

<Overlay />
{#if $lists}
  <div>
    <input placeholder="List" type="text" bind:value={list} />
    <input placeholder="Item" type="text" bind:value={item} />
    <button on:click={() => lists.add(list, item)}>Append</button>
    <button on:click={() => lists.add(list, item, false)}>Prepend</button>
  </div>

  {#each $lists as list, i}
    <h2>{list.title}</h2>
    <ul>
      <Sortable
        items={list.items.slice()}
        identify={(item) => item.id}
        let:item
        on:sort={({ detail }) => lists.move(i, detail.from, detail.to)}
        animation={150}
      >
        <article>
          {item.data}
          <span>{item.order}</span>
        </article>
      </Sortable>
    </ul>
  {/each}
{:else}
  Loading...
{/if}

<style>
  article {
    background-color: crimson;
    align-items: center;
    border-radius: 0.5rem;
    display: flex;
    color: white;
    padding: 1rem;
    margin: 0.5rem;
  }
  span {
    margin-left: auto;
    font-size: 0.8rem;
    opacity: 0.7;
  }
</style>
