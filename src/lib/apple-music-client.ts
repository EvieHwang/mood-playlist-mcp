/**
 * Apple Music API wrapper — handles catalog search, playlist creation, and listing.
 */

const BASE_URL = "https://api.music.apple.com/v1";

export interface AppleMusicConfig {
  developerToken: string;
  musicUserToken: string;
}

export interface CatalogSong {
  id: string;
  name: string;
  artistName: string;
  albumName: string;
}

export interface LibraryPlaylist {
  id: string;
  name: string;
  trackCount: number;
}

function headers(config: AppleMusicConfig): Record<string, string> {
  return {
    Authorization: `Bearer ${config.developerToken}`,
    "Music-User-Token": config.musicUserToken,
    "Content-Type": "application/json",
  };
}

/** Search the Apple Music catalog. */
export async function searchCatalog(
  config: AppleMusicConfig,
  query: string,
  type: string = "songs",
  limit: number = 5,
): Promise<CatalogSong[]> {
  const params = new URLSearchParams({
    term: query,
    types: type,
    limit: String(limit),
  });

  const res = await fetch(`${BASE_URL}/catalog/us/search?${params}`, {
    headers: headers(config),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Apple Music search failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  const songs = data?.results?.songs?.data ?? [];

  return songs.map((s: { id: string; attributes: Record<string, string> }) => ({
    id: s.id,
    name: s.attributes.name,
    artistName: s.attributes.artistName,
    albumName: s.attributes.albumName,
  }));
}

/** Create a playlist in the user's library. */
export async function createPlaylist(
  config: AppleMusicConfig,
  name: string,
  description: string,
  trackIds: string[],
): Promise<{ id: string; name: string }> {
  const body = {
    attributes: { name, description },
    relationships: {
      tracks: {
        data: trackIds.map((id) => ({ id, type: "songs" })),
      },
    },
  };

  const res = await fetch(`${BASE_URL}/me/library/playlists`, {
    method: "POST",
    headers: headers(config),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to create playlist (${res.status}): ${text}`);
  }

  const data = await res.json();
  const playlist = data?.data?.[0];
  return {
    id: playlist?.id ?? "unknown",
    name: playlist?.attributes?.name ?? name,
  };
}

/** List playlists in the user's library. */
export async function listPlaylists(
  config: AppleMusicConfig,
  limit: number = 25,
): Promise<LibraryPlaylist[]> {
  const params = new URLSearchParams({ limit: String(limit) });

  const res = await fetch(`${BASE_URL}/me/library/playlists?${params}`, {
    headers: headers(config),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to list playlists (${res.status}): ${body}`);
  }

  const data = await res.json();
  const playlists = data?.data ?? [];

  return playlists.map((p: { id: string; attributes: Record<string, string | number> }) => ({
    id: p.id,
    name: p.attributes.name,
    trackCount: (p.attributes as Record<string, number>).trackCount ?? 0,
  }));
}
