import { describe, it, expect } from "vitest";
import { findBestMatch } from "../src/lib/fuzzy-match.js";
import type { CatalogSong } from "../src/lib/apple-music-client.js";

function song(name: string, artist: string, album = "Unknown"): CatalogSong {
  return { id: `id-${name}`, name, artistName: artist, albumName: album };
}

describe("findBestMatch", () => {
  it("exact match: 'Says' by Nils Frahm", () => {
    const candidates = [
      song("Says", "Nils Frahm", "Spaces"),
      song("Something Else", "Other Artist"),
    ];
    const result = findBestMatch({ title: "Says", artist: "Nils Frahm" }, candidates);

    expect(result.match_type).toBe("exact");
    if (result.match_type !== "not_found") {
      expect(result.matched_track.name).toBe("Says");
      expect(result.matched_track.artistName).toBe("Nils Frahm");
    }
  });

  it("fuzzy match: 'Re: Stacks' vs 'Re:Stacks'", () => {
    const candidates = [song("Re:Stacks", "Bon Iver", "For Emma, Forever Ago")];
    const result = findBestMatch({ title: "Re: Stacks", artist: "Bon Iver" }, candidates);

    expect(result.match_type).not.toBe("not_found");
    if (result.match_type !== "not_found") {
      expect(result.matched_track.name).toBe("Re:Stacks");
    }
  });

  it("album variant: accepts either version", () => {
    const candidates = [
      song("Says", "Nils Frahm", "All Melody"),
      song("Says", "Nils Frahm", "Spaces"),
    ];
    const result = findBestMatch({ title: "Says", artist: "Nils Frahm" }, candidates);

    expect(result.match_type).not.toBe("not_found");
    if (result.match_type !== "not_found") {
      expect(result.matched_track.artistName).toBe("Nils Frahm");
    }
  });

  it("not found: completely wrong artist", () => {
    const candidates = [song("Bohemian Rhapsody", "Queen", "A Night at the Opera")];
    const result = findBestMatch({ title: "Says", artist: "Nils Frahm" }, candidates);

    expect(result.match_type).toBe("not_found");
  });

  it("returns not_found for empty candidates", () => {
    const result = findBestMatch({ title: "Anything", artist: "Anyone" }, []);
    expect(result.match_type).toBe("not_found");
  });

  it("prefers higher scoring match", () => {
    const candidates = [
      song("Says", "Some Other Artist", "Album"),
      song("Says", "Nils Frahm", "Spaces"),
    ];
    const result = findBestMatch({ title: "Says", artist: "Nils Frahm" }, candidates);

    expect(result.match_type).not.toBe("not_found");
    if (result.match_type !== "not_found") {
      expect(result.matched_track.artistName).toBe("Nils Frahm");
    }
  });
});
