/**
 * Fuzzy matching for song search results.
 * Scores artist similarity (60%) + title similarity (40%).
 * Thresholds: >0.7 auto-accept, <0.4 reject, between = accept with flag.
 */

import { compareTwoStrings } from "string-similarity";
import type { CatalogSong } from "./apple-music-client.js";

export interface SongQuery {
  title: string;
  artist: string;
}

export interface MatchResult {
  matched_track: CatalogSong;
  match_type: "exact" | "fuzzy";
  confidence_score: number;
}

export type FuzzyMatchResult = MatchResult | { match_type: "not_found" };

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
}

function scoreSong(query: SongQuery, candidate: CatalogSong): number {
  const artistScore = compareTwoStrings(normalize(query.artist), normalize(candidate.artistName));
  const titleScore = compareTwoStrings(normalize(query.title), normalize(candidate.name));
  return artistScore * 0.6 + titleScore * 0.4;
}

/** Find the best match for a song query among Apple Music search results. */
export function findBestMatch(query: SongQuery, candidates: CatalogSong[]): FuzzyMatchResult {
  if (candidates.length === 0) {
    return { match_type: "not_found" };
  }

  let bestScore = 0;
  let bestCandidate = candidates[0];

  for (const candidate of candidates) {
    const score = scoreSong(query, candidate);
    if (score > bestScore) {
      bestScore = score;
      bestCandidate = candidate;
    }
  }

  if (bestScore < 0.4) {
    return { match_type: "not_found" };
  }

  const matchType = bestScore > 0.85 ? "exact" : "fuzzy";

  return {
    matched_track: bestCandidate,
    match_type: matchType,
    confidence_score: Math.round(bestScore * 100) / 100,
  };
}
