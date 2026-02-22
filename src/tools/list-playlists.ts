/**
 * MCP tool: list_my_playlists — list playlists in the user's Apple Music library.
 */

import { listPlaylists, type AppleMusicConfig } from "../lib/apple-music-client.js";

export interface ListPlaylistsInput {
  limit?: number;
}

export async function handleListPlaylists(
  input: ListPlaylistsInput,
  musicConfig: AppleMusicConfig,
) {
  const { limit = 25 } = input;

  const playlists = await listPlaylists(musicConfig, limit);

  return {
    playlists: playlists.map((p) => ({
      name: p.name,
      id: p.id,
      track_count: p.trackCount,
    })),
  };
}
