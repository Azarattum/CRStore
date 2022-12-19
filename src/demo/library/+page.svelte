<script lang="ts">
  import {
    all,
    artists,
    albums,
    playlists,
    grouped,
    organized,
  } from "./library";
  import Tracks from "./Tracks.svelte";

  let title = "";
  let artistId = "";
  let albumId = "";
  let trackLink = "";
  let playlistLink = "";
  let artist = "";
  let album = "";
  let playlist = "";
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
  <input placeholder="Playlist" type="text" bind:value={playlist} />
  <button on:click={() => playlists.add(playlist)}>+</button>
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
      <option value={album.id}>{album.title}</option>
    {/each}
  </select>
  <button on:click={() => all.add(title, artistId, albumId)}>+</button>
</div>
<div>
  <select bind:value={trackLink}>
    {#each $all as track}
      <option value={track.id}>{track.title}</option>
    {/each}
  </select>
  <select bind:value={playlistLink}>
    {#each $playlists as playlist}
      <option value={playlist.id}>{playlist.title}</option>
    {/each}
  </select>
  <button on:click={() => playlists.link(trackLink, playlistLink)}>+</button>
</div>

<h2>Tracks:</h2>
<Tracks tracks={$all} />

<h2>Artists:</h2>
<ul>
  {#each $artists as artist}
    <li>{artist.title}</li>
  {/each}
</ul>

<h2>Tracks by album:</h2>
{#each $grouped as { album, tracks }}
  <details>
    <summary>{album}</summary>
    <Tracks {tracks} />
  </details>
{/each}

<h2>Tracks by playlist:</h2>
{#each $organized as { playlist, tracks }}
  <details>
    <summary>{playlist}</summary>
    <Tracks {tracks} />
  </details>
{/each}

<style>
  li {
    animation: blink 1s 1;
  }

  @keyframes blink {
    0% {
      background-color: red;
    }
  }
</style>
