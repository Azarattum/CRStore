<script lang="ts">
  import { all, artists, grouped } from "./library";
  import Tracks from "./Tracks.svelte";

  let title = "";
  let artist = "";
  let album = "";
</script>

<div>
  <input placeholder="Title" type="text" bind:value={title} />
  <input placeholder="Artist" type="text" bind:value={artist} />
  <input placeholder="Album" type="text" bind:value={album} />
  <button on:click={() => all.add(title, artist, album)}>+</button>
</div>

{#if $all}
  {#key $all}
    <h2>Tracks:</h2>
  {/key}
  <Tracks tracks={$all} />
{/if}

{#if $artists}
  {#key $artists}
    <h2>Artists:</h2>
  {/key}
  <ul>
    {#each $artists as artist}
      <li>{artist.title}</li>
    {/each}
  </ul>
{/if}

{#if $grouped}
  {#key $grouped}
    <h2>Tracks by album:</h2>
  {/key}
  {#each $grouped as { album, tracks }}
    <details>
      <summary>{album}</summary>
      <Tracks tracks={JSON.parse(tracks)} />
    </details>
  {/each}
{/if}

<style>
  h2 {
    animation: blink 1s 1;
  }

  @keyframes blink {
    0% {
      background-color: red;
    }
  }
</style>
