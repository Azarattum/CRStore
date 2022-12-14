<script lang="ts">
  import { all, artists, albums, grouped } from "./library";
  import Tracks from "./Tracks.svelte";

  let title = "";
  let artistId = "";
  let albumId = "";
  let artist = "";
  let album = "";
</script>

<div>
  <input placeholder="Artist" type="text" bind:value={artist} />
  <button on:click={() => artists.add(artist)}>+</button>
</div>
<div>
  <input placeholder="Album" type="text" bind:value={album} />
  <button on:click={() => albums.add(album)}>+</button>
</div>
<div>
  <input placeholder="Title" type="text" bind:value={title} />
  <select bind:value={artistId}>
    {#each $artists as artist}
      <option value={artist.id}>{artist.title}</option>
    {/each}
  </select>
  <select bind:value={albumId}>
    {#each $albums as album, i}
      <option value={album.id} selected={i === 1}>{album.title}</option>
    {/each}
  </select>
  <button on:click={() => all.add(title, artistId, albumId)}>+</button>
</div>

{#key $all}
  <h2>Tracks:</h2>
{/key}
<Tracks tracks={$all} />

{#key $artists}
  <h2>Artists:</h2>
{/key}
<ul>
  {#each $artists as artist}
    <li>{artist.title}</li>
  {/each}
</ul>

{#key $grouped}
  <h2>Tracks by album:</h2>
{/key}
{#each $grouped as { album, tracks }}
  <details>
    <summary>{album}</summary>
    <Tracks tracks={JSON.parse(tracks)} />
  </details>
{/each}

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
