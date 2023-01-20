import { crr, primary, index } from "../../lib";
import { object, string } from "superstruct";

const tracks = object({
  id: string(),
  title: string(),
  artist: string(),
  album: string(),
});
crr(tracks);
primary(tracks, "id");

const artists = object({
  id: string(),
  title: string(),
});
crr(artists);
primary(artists, "id");

const albums = object({
  id: string(),
  title: string(),
});
crr(albums);
primary(albums, "id");

const playlists = object({
  id: string(),
  title: string(),
});
crr(playlists);
primary(playlists, "id");

const tracksByPlaylist = object({
  id: string(),
  track: string(),
  playlist: string(),
  order: string(),
});
crr(tracksByPlaylist);
primary(tracksByPlaylist, "id");
index(tracksByPlaylist, "order");
index(tracksByPlaylist, "playlist");

const schema = object({ tracks, artists, albums, playlists, tracksByPlaylist });

export { schema };
