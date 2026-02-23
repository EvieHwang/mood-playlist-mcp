/**
 * MCP tool: create_mood_playlist — create an Apple Music playlist from mood + songs.
 */

import { searchCatalog, createPlaylist, type AppleMusicConfig } from "../lib/apple-music-client.js";
import { findBestMatch, type SongQuery, type FuzzyMatchResult } from "../lib/fuzzy-match.js";

export interface CreateMoodPlaylistInput {
  mood: string;
  songs: Array<{ title: string; artist: string }>;
  playlist_name: string;
}

interface TrackResult {
  requested: { title: string; artist: string };
  matched: { title: string; artist: string; album: string; apple_music_id: string } | null;
  match_type: "exact" | "fuzzy" | "not_found";
}

export async function handleCreateMoodPlaylist(
  input: CreateMoodPlaylistInput,
  musicConfig: AppleMusicConfig,
) {
  const { mood, songs, playlist_name } = input;

  if (!mood || !songs?.length || !playlist_name) {
    return { error: "mood, songs, and playlist_name are all required" };
  }

  // Match each song against Apple Music catalog
  const trackResults: TrackResult[] = [];
  const matchedIds: string[] = [];

  for (const song of songs) {
    const result = await matchSong(song, musicConfig);
    trackResults.push(result);
    if (result.matched) {
      matchedIds.push(result.matched.apple_music_id);
    }
  }

  if (matchedIds.length === 0) {
    return {
      error: "No songs could be matched in the Apple Music catalog",
      tracks_added: trackResults,
    };
  }

  // Create the playlist
  const playlist = await createPlaylist(musicConfig, playlist_name, mood, matchedIds);

  return {
    playlist_name: playlist.name,
    tracks_added: trackResults,
    apple_music_playlist_url: `https://music.apple.com/library/playlist/${playlist.id}`,
  };
}

async function matchSong(song: SongQuery, config: AppleMusicConfig): Promise<TrackResult> {
  const base: TrackResult = {
    requested: { title: song.title, artist: song.artist },
    matched: null,
    match_type: "not_found",
  };

  try {
    // Try full query first
    let results = await searchCatalog(config, `${song.title} ${song.artist}`, "songs", 5);

    // Fallback: title only
    if (results.length === 0) {
      results = await searchCatalog(config, song.title, "songs", 5);
    }

    const match: FuzzyMatchResult = findBestMatch(song, results);

    if (match.match_type === "not_found") {
      return base;
    }

    return {
      ...base,
      matched: {
        title: match.matched_track.name,
        artist: match.matched_track.artistName,
        album: match.matched_track.albumName,
        apple_music_id: match.matched_track.id,
      },
      match_type: match.match_type,
    };
  } catch (err) {
    console.error(`Error matching song "${song.title}" by ${song.artist}:`, err);
    return base;
  }
}
