import type { ObjectSchema } from "superstruct/dist/utils";
import { crr, primary, index } from "../../lib";
import { object, string } from "superstruct";

const table = <S extends ObjectSchema>(schema: S, indexes: (keyof S)[] = []) =>
  index(crr(object(schema)), indexes as string[]);

const tracks = table({
  id: primary(string()),
  title: string(),
  artist: string(),
  album: string(),
});

const artists = table({
  id: primary(string()),
  title: string(),
});

const albums = table({
  id: primary(string()),
  title: string(),
});

const playlists = table({
  id: primary(string()),
  title: string(),
});

const tracksByPlaylist = table(
  {
    id: primary(string()),
    track: string(),
    playlist: string(),
    order: string(),
  },
  ["order", "playlist"]
);

const schema = object({ tracks, artists, albums, playlists, tracksByPlaylist });

export { schema };
