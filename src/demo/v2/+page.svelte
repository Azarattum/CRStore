<script lang="ts">
  import { Schema } from "../schema";
  import { trpc } from "../client";
  import { sql } from "kysely";
  import { database } from "$lib/crstore2";
  import { onDestroy } from "svelte";

  const { store, close } = database(Schema, {
    push: (changes) => trpc.push.mutate(changes),
    pull: (version, client, onData) =>
      trpc.pull.subscribe({ version, client }, { onData }).unsubscribe,
  });
  onDestroy(close);

  const todos = store((db) => db.selectFrom("todos").selectAll(), {
    create(db, title: string, text: string) {
      const id = Math.random().toString(36).slice(2);
      const todo = { id, title, text, completed: false };
      return db.insertInto("todos").values(todo);
    },
    toggle(db, id: string) {
      return db
        .updateTable("todos")
        .set({ completed: sql`NOT(completed)` })
        .where("id", "=", id);
    },
    remove(db, id: string) {
      return db.deleteFrom("todos").where("id", "=", id);
    },
  });

  let title = "";
  let text = "";
</script>

{#if $todos}
  <div>
    <input placeholder="Title" type="text" bind:value={title} />
    <input placeholder="Text" type="text" bind:value={text} />
    <button on:click={() => todos.create(title, text)}>+</button>
  </div>
  <ul>
    {#each $todos as todo}
      <li>
        <button
          on:click={() => todos.toggle(todo.id)}
          class="todo"
          class:done={todo.completed}
        >
          <h2>{todo.title}</h2>
          <p>{todo.text}</p>
        </button>
        <button on:click={() => todos.remove(todo.id)}>x</button>
      </li>
    {/each}
  </ul>
{:else}
  Loading...
{/if}

<style>
  li {
    display: flex;
    margin: 1rem;
    max-width: 40rem;
  }
  .todo {
    width: 100%;
  }
  .done {
    background-color: darkolivegreen;
    color: white;
  }
</style>
