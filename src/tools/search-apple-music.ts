/**
 * MCP tool: search_apple_music — search the Apple Music catalog.
 */

import { searchCatalog, type AppleMusicConfig } from "../lib/apple-music-client.js";

export interface SearchInput {
  query: string;
  type?: string;
  limit?: number;
}

export async function handleSearchAppleMusic(input: SearchInput, musicConfig: AppleMusicConfig) {
  const { query, type = "songs", limit = 5 } = input;

  if (!query) {
    return { error: "query is required" };
  }

  const results = await searchCatalog(musicConfig, query, type, limit);

  return {
    results: results.map((r) => ({
      id: r.id,
      name: r.name,
      artist: r.artistName,
      album: r.albumName,
    })),
  };
}
