/**
 * Unsplash integration — fetch a thematic cover image for a mood description.
 */

const UNSPLASH_API = "https://api.unsplash.com";

/** Search Unsplash for a landscape photo matching the mood query. Returns URL or null. */
export async function fetchMoodImage(accessKey: string, mood: string): Promise<string | null> {
  const params = new URLSearchParams({
    query: mood,
    orientation: "landscape",
    per_page: "1",
  });

  try {
    const res = await fetch(`${UNSPLASH_API}/search/photos?${params}`, {
      headers: { Authorization: `Client-ID ${accessKey}` },
    });

    if (!res.ok) {
      console.error(`Unsplash search failed (${res.status})`);
      return null;
    }

    const data = await res.json();
    const results = data?.results ?? [];
    if (results.length === 0) return null;

    return results[0]?.urls?.regular ?? null;
  } catch (err) {
    console.error("Unsplash fetch error:", err);
    return null;
  }
}
