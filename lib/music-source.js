const APPLE_SEARCH_BASE = "https://itunes.apple.com/search";
const cache = new Map();

const palette = ["#ff7a5c", "#4cc9f0", "#ffd166", "#8bd450", "#ef476f", "#53c8c1"];

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function sanitizePrompt(prompt) {
  return String(prompt || "")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildSeedQueries(prompt, tags, bodyState) {
  const seeds = [sanitizePrompt(prompt)];

  if (bodyState?.modeId === "recovery-reset") {
    seeds.push("gentle ambient recovery", "soft focus electronic");
  }

  if (bodyState?.modeId === "steady-focus") {
    seeds.push("minimal focus electronic", "clean instrumental groove");
  }

  if (bodyState?.modeId === "momentum-lift") {
    seeds.push("uplifting electronic drive", "indie dance momentum");
  }

  if (bodyState?.modeId === "night-drift") {
    seeds.push("cinematic night drive", "blue hour electronic");
  }

  if (tags.includes("night") && tags.includes("drive")) {
    seeds.push("night drive synthwave", "dream pop night drive");
  }

  if (tags.includes("study")) {
    seeds.push("ambient focus instrumental", "lofi study beats");
  }

  if (tags.includes("calm") || tags.includes("rain")) {
    seeds.push("ambient calm", "soft indie rain");
  }

  if (tags.includes("bright") || bodyState?.energyMode === "lift") {
    seeds.push("feel good indie pop", "uplifting groove");
  }

  if (tags.includes("groove")) {
    seeds.push("nu disco groove", "indie groove");
  }

  if (bodyState?.focusMode === "night-drive") {
    seeds.push("cinematic electronic night");
  }

  return unique(seeds).slice(0, 3);
}

function inferEnergy(tags, bodyState, genre) {
  const genreText = String(genre || "").toLowerCase();

  if (bodyState?.recoveryBand === "low") {
    return "low";
  }

  if (bodyState?.modeId === "night-drift" && !/dance|house|funk/.test(genreText)) {
    return "low";
  }

  if (
    bodyState?.recoveryBand === "high" ||
    tags.includes("bright") ||
    tags.includes("groove") ||
    /dance|pop|electronic|house|funk/.test(genreText)
  ) {
    return "medium";
  }

  return "low";
}

function buildReason(tags, bodyState, track, index) {
  const genre = track.primaryGenreName || "this kind of sound";

  if (bodyState?.recoveryBand === "low" && index === 0) {
    return `Start with a softer ${genre} track so the body can settle before the set moves forward.`;
  }

  if (bodyState?.recoveryBand === "high" && index === 0) {
    return `Recovery is strong today, so this more propulsive ${genre} track makes sense as the opener.`;
  }

  if (tags.includes("study")) {
    return `Its information density is just right for holding focus without getting in the way.`;
  }

  if (tags.includes("night")) {
    return `Its color and sense of space fit the way this set wants to unfold after dark.`;
  }

  if (tags.includes("groove")) {
    return `Its groove feels natural enough to move the whole set forward through the body.`;
  }

  return `It connects the atmosphere smoothly and makes the full arc feel more complete.`;
}

async function fetchAppleSongs(term, country = "US") {
  const cacheKey = `${country}:${term}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < 10 * 60 * 1000) {
    return cached.data;
  }

  const url = new URL(APPLE_SEARCH_BASE);
  url.searchParams.set("term", term);
  url.searchParams.set("media", "music");
  url.searchParams.set("entity", "song");
  url.searchParams.set("limit", "10");
  url.searchParams.set("country", country);
  url.searchParams.set("explicit", "No");

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Apple search failed: ${response.status}`);
  }

  const payload = await response.json();
  const results = Array.isArray(payload.results) ? payload.results : [];
  cache.set(cacheKey, { at: Date.now(), data: results });
  return results;
}

export async function buildApplePreviewPlaylist({ prompt, tags, bodyState, limit = 4 }) {
  const queries = buildSeedQueries(prompt, tags, bodyState);
  const country = process.env.APPLE_SEARCH_COUNTRY || "US";
  const allResults = [];
  const seen = new Set();

  for (const query of queries) {
    const results = await fetchAppleSongs(query, country);
    for (const track of results) {
      if (!track.previewUrl || !track.trackId || seen.has(track.trackId)) {
        continue;
      }
      seen.add(track.trackId);
      allResults.push(track);
    }
    if (allResults.length >= limit) {
      break;
    }
  }

  return allResults.slice(0, limit).map((track, index) => ({
    id: `apple-${track.trackId}`,
    title: track.trackName,
    artist: track.artistName,
    durationSec: Math.round((track.trackTimeMillis || 30_000) / 1000),
    energy: inferEnergy(tags, bodyState, track.primaryGenreName),
    tags,
    color: palette[index % palette.length],
    noteSet: ["C3", "E3", "G3", "A3"],
    reason: buildReason(tags, bodyState, track, index),
    queueIndex: index + 1,
    previewUrl: track.previewUrl,
    artworkUrl: track.artworkUrl100,
    trackViewUrl: track.trackViewUrl,
    collectionName: track.collectionName,
    genre: track.primaryGenreName,
    source: "apple-preview",
    attribution: "Preview courtesy of Apple iTunes"
  }));
}
