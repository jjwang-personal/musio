import { quickPrompts, trackCatalog, tastePresets } from "./catalog.js";
import { buildApplePreviewPlaylist } from "./music-source.js";

const keywordGroups = {
  night: ["夜", "晚上", "深夜", "night", "midnight", "霓虹"],
  drive: ["开车", "drive", "通勤", "高速"],
  rain: ["雨", "下雨", "rain", "雨天"],
  study: ["学习", "写字", "工作", "study", "focus", "专注"],
  morning: ["早上", "清晨", "morning", "通勤", "醒脑"],
  groove: ["律动", "groove", "摇摆", "微醺", "swing"],
  cooking: ["做饭", "下厨", "cooking", "kitchen"],
  calm: ["安静", "柔和", "calm", "soft", "轻一点"],
  bright: ["积极", "明亮", "bright", "sunrise"],
  cinematic: ["电影感", "cinematic", "铺陈", "叙事"]
};

const reasonTemplates = {
  night: "It keeps the night air and the negative space intact, so the mood can arrive slowly.",
  drive: "The rhythm moves like passing streetlights, ideal for settling into motion.",
  rain: "There is enough grain and softness here to quiet the room around you.",
  study: "The information density stays low, which helps focus without taking over.",
  morning: "It has lift without slamming the gas pedal, which works well for waking up slowly.",
  groove: "The body picks up the pulse before the mind fully catches up.",
  cooking: "It keeps the hands moving without making the room feel busy.",
  calm: "There is enough air in it to serve as a steady, low-pressure backdrop.",
  bright: "It lightens the atmosphere and gently pulls your energy upward.",
  cinematic: "It carries enough scene-setting weight to bridge one moment into the next."
};

const toneProfiles = {
  gentle: {
    introLead: "Let us keep the lights low and the pressure off.",
    setLead: "I am keeping this one softer on purpose.",
    moodPivot: "Nothing here needs to prove itself too quickly.",
    segueVerb: "glides",
    reasonLead: "This helps the body settle first."
  },
  clear: {
    introLead: "We will keep the lane clean and uncluttered.",
    setLead: "This set is tuned for steadiness and control.",
    moodPivot: "The movement comes in measured steps.",
    segueVerb: "locks",
    reasonLead: "This keeps the attention channel clean."
  },
  bright: {
    introLead: "We can start with more confidence today.",
    setLead: "There is room here for more lift and motion.",
    moodPivot: "The energy can come forward without feeling reckless.",
    segueVerb: "pushes",
    reasonLead: "This gives the set a stronger launch."
  },
  hushed: {
    introLead: "Keep the room dim and let the air do some of the talking.",
    setLead: "This one should feel nocturnal, spacious, and unhurried.",
    moodPivot: "The pulse stays under the skin instead of on top of it.",
    segueVerb: "drifts",
    reasonLead: "This protects the negative space."
  }
};

function normalizePrompt(input) {
  return String(input || "")
    .trim()
    .toLowerCase();
}

function inferTags(prompt) {
  const normalized = normalizePrompt(prompt);
  const tags = new Set();

  for (const [tag, words] of Object.entries(keywordGroups)) {
    if (words.some((word) => normalized.includes(word.toLowerCase()))) {
      tags.add(tag);
    }
  }

  if (tags.size === 0) {
    tags.add("calm");
    tags.add("groove");
  }

  if (tags.has("night") && !tags.has("drive")) {
    tags.add("cinematic");
  }

  return [...tags];
}

function applyBodyStateTags(tags, bodyState) {
  const nextTags = new Set(tags);
  if (!bodyState) {
    return [...nextTags];
  }

  (bodyState.recommendedTags || []).forEach((tag) => nextTags.add(tag));

  if (bodyState.energyMode === "gentle" || bodyState.energyMode === "wind-down") {
    nextTags.add("calm");
  }

  if (bodyState.energyMode === "lift") {
    nextTags.add("bright");
    nextTags.add("groove");
  }

  if (bodyState.focusMode === "deep-focus" || bodyState.focusMode === "soft-landing") {
    nextTags.add("study");
  }

  if (bodyState.focusMode === "night-drive") {
    nextTags.add("night");
    nextTags.add("cinematic");
  }

  (bodyState.suppressedTags || []).forEach((tag) => nextTags.delete(tag));

  return [...nextTags];
}

function energyRank(level) {
  if (level === "medium") return 1;
  if (level === "high") return 2;
  return 0;
}

function getArcPhases(bodyState) {
  return bodyState?.arcPhases || [
    { label: "Opening", targetEnergy: "low", goal: "Start with atmosphere first." },
    { label: "Center", targetEnergy: "low", goal: "Keep the room steady." },
    { label: "Lift", targetEnergy: "medium", goal: "Add some motion." },
    { label: "Finish", targetEnergy: "medium", goal: "Close with shape and momentum." }
  ];
}

function getToneProfile(bodyState) {
  return toneProfiles[bodyState?.djTone] || toneProfiles.clear;
}

function orderPlaylistByArc(playlist, tags, bodyState) {
  const phases = getArcPhases(bodyState);
  const remaining = [...playlist];
  const ordered = [];

  phases.forEach((phase, phaseIndex) => {
    if (!remaining.length) {
      return;
    }

    let bestIndex = 0;
    let bestScore = -Infinity;

    remaining.forEach((track, index) => {
      let score = scoreTrack(track, tags, bodyState);
      score -= Math.abs(energyRank(track.energy) - energyRank(phase.targetEnergy)) * 3;

      if (phaseIndex === 0 && tags.includes("night") && track.tags?.includes("night")) {
        score += 2;
      }

      if (phaseIndex === phases.length - 1 && bodyState?.modeId === "night-drift" && track.energy === "low") {
        score += 2;
      }

      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });

    const [picked] = remaining.splice(bestIndex, 1);
    ordered.push({
      ...picked,
      phaseLabel: phase.label,
      phaseGoal: phase.goal
    });
  });

  return ordered.map((track, index) => ({
    ...track,
    queueIndex: index + 1
  }));
}

function scoreTrack(track, tags, bodyState) {
  const base = tags.reduce((score, tag) => {
    return score + (track.tags.includes(tag) ? 3 : 0);
  }, 0);

  let nextScore = base;

  if (tags.includes("night") && track.energy === "low") {
    nextScore += 1;
  }

  if (tags.includes("morning") && track.energy === "medium") {
    nextScore += 1;
  }

  if (bodyState?.recoveryBand === "low" && track.energy === "low") {
    nextScore += 3;
  }

  if (bodyState?.recoveryBand === "low" && track.energy === "medium") {
    nextScore -= 1;
  }

  if (bodyState?.recoveryBand === "high" && track.energy === "medium") {
    nextScore += 2;
  }

  if (bodyState?.focusMode === "deep-focus" && track.tags.includes("focus")) {
    nextScore += 2;
  }

  if (bodyState?.focusMode === "night-drive" && track.tags.includes("drive")) {
    nextScore += 2;
  }

  if (bodyState?.modeId === "recovery-reset" && track.tags.includes("soft")) {
    nextScore += 2;
  }

  if (bodyState?.modeId === "momentum-lift" && track.tags.includes("groove")) {
    nextScore += 2;
  }

  if (bodyState?.modeId === "night-drift" && track.tags.includes("cinematic")) {
    nextScore += 2;
  }

  return nextScore;
}

function buildBodyStateLine(bodyState) {
  if (!bodyState) {
    return "";
  }

  if (bodyState.recoveryBand === "low") {
    return "I checked your body state for today, and recovery is not fully back, so this set starts softer and more controlled. ";
  }
  if (bodyState.recoveryBand === "high") {
    return "Your recovery looks strong today, so I can give this set more light and momentum. ";
  }
  return `Your system feels steady today, so I am steering this more like ${bodyState.modeLabel || "a balanced set"}, with focus first and motion arriving later. `;
}

function buildIntro(prompt, tags, playlist, prefs, bodyState) {
  const opener = prefs.djName || "Musio";
  const tone = getToneProfile(bodyState);
  const modeLead = bodyState?.modeLabel
    ? `${bodyState.modeLabel} is active today. `
    : "";
  const moodLine = tags.includes("night")
    ? `${tone.introLead} We start with something built for the road. `
    : tags.includes("rain")
      ? `${tone.introLead} First, we quiet the edges of the room and let the space settle. `
      : tags.includes("morning")
        ? `${tone.introLead} No need to go full throttle immediately. We lift the system with cleaner rhythms first. `
        : `${tone.introLead} We open with atmosphere first, then let the body follow. `;

  const leadTrack = playlist[0];
  const bodyLine = buildBodyStateLine(bodyState);
  return `${opener} picked up your request: ${prompt}. ${modeLead}${bodyLine}${tone.setLead} ${tone.moodPivot} ${moodLine}We begin with "${leadTrack.title}" and build the emotional arc from there.`;
}

function buildSegue(tags, bodyState) {
  if (bodyState?.modeSummary) {
    const tone = getToneProfile(bodyState);
    const phaseLabels = getArcPhases(bodyState)
      .map((phase) => phase.label)
      .join(` ${tone.segueVerb} into `);
    return `${bodyState.modeSummary} The arc today runs ${phaseLabels}.`;
  }

  if (bodyState?.recoveryBand === "low") {
    return "This set keeps stimulation down first, protects your state, and adds movement only once the room is calm.";
  }
  if (bodyState?.recoveryBand === "high") {
    return "The first half raises the brightness, and the second half pushes your pace and heartbeat forward together.";
  }
  if (tags.includes("drive")) {
    return "The first stretch locks in the cruise speed, and the second stretch lifts the pulse.";
  }
  if (tags.includes("study")) {
    return "The whole set keeps the information density controlled so your attention always has somewhere to land.";
  }
  if (tags.includes("groove")) {
    return "The groove does not spike immediately. It lets the body find its own swing.";
  }
  return "This set enters through atmosphere first and adds motion little by little.";
}

function buildReason(tags, index, bodyState) {
  const phase = getArcPhases(bodyState)[index];
  if (phase && bodyState?.modeId) {
    const tone = getToneProfile(bodyState);
    return `${phase.label}: ${tone.reasonLead} ${phase.goal}`;
  }

  if (bodyState?.recoveryBand === "low" && index === 0) {
    return "Its stimulation level is more restrained, which makes it a better opening when recovery is running low.";
  }
  if (bodyState?.recoveryBand === "high" && index === 0) {
    return "Your recovery looks good, so this can work as a stronger launch point for the set.";
  }
  const focusTag = tags[index % tags.length];
  return reasonTemplates[focusTag] || "It is here to hold the atmosphere steady and keep the transition smooth.";
}

function pickFallbackPlaylist(tags, bodyState) {
  return [...trackCatalog]
    .map((track) => ({ track, score: scoreTrack(track, tags, bodyState) }))
    .sort((a, b) => b.score - a.score || a.track.bpm - b.track.bpm)
    .slice(0, 4)
    .map(({ track }, index) => ({
      ...track,
      queueIndex: index + 1,
      reason: buildReason(tags, index, bodyState)
    }));
}

async function generateOpenAiCopy({ prompt, playlist, prefs, tags, bodyState }) {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const baseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const catalogSummary = playlist
    .map((track) => `${track.id}: ${track.title} - ${track.artist}`)
    .join("\n");

  const response = await fetch(`${baseUrl}/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text:
                "You are an AI radio DJ. Reply in JSON with keys intro, segue, and reasons. " +
                "Use concise English. Respect the body-state mode, the pacing arc, and the stimulation cap. " +
                "Match the requested DJ tone and transition style very clearly. " +
                "reasons must be an array matching the playlist order."
            }
          ]
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                `User prompt: ${prompt}\n` +
                `Taste notes: ${prefs.tasteNotes}\n` +
                `Mood tags: ${tags.join(", ")}\n` +
                `Body state: ${bodyState ? JSON.stringify(bodyState) : "none"}\n` +
                `DJ tone: ${bodyState?.djTone || "clear"}\n` +
                `Transition style: ${bodyState?.transitionStyle || "clean fades"}\n` +
                `Arc phases: ${getArcPhases(bodyState).map((phase) => `${phase.label} (${phase.targetEnergy})`).join(", ")}\n` +
                `Playlist:\n${catalogSummary}`
            }
          ]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "dj_copy",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              intro: { type: "string" },
              segue: { type: "string" },
              reasons: {
                type: "array",
                items: { type: "string" }
              }
            },
            required: ["intro", "segue", "reasons"]
          }
        }
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI request failed: ${response.status} ${errorText}`);
  }

  const payload = await response.json();
  const text = payload.output_text || "{}";
  return JSON.parse(text);
}

export async function createDjPlan(prompt, prefs, bodyState = null) {
  const safePrompt = prompt?.trim() || quickPrompts[0];
  const tags = applyBodyStateTags(inferTags(safePrompt), bodyState);
  let playlist = [];
  let musicSource = "apple-preview";
  let intro = "";
  let segue = buildSegue(tags, bodyState);
  let source = "heuristic";

  try {
    playlist = await buildApplePreviewPlaylist({
      prompt: safePrompt,
      tags,
      bodyState,
      limit: 4
    });
  } catch (error) {
    console.warn("[musio] Apple preview lookup failed:", error.message);
  }

  if (playlist.length === 0) {
    playlist = pickFallbackPlaylist(tags, bodyState);
    musicSource = "local-fallback";
  }

  playlist = orderPlaylistByArc(playlist, tags, bodyState);
  playlist = playlist.map((track, index) => ({
    ...track,
    queueIndex: index + 1,
    reason: buildReason(tags, index, bodyState)
  }));

  intro = buildIntro(safePrompt, tags, playlist, prefs, bodyState);

  try {
    const aiCopy = await generateOpenAiCopy({
      prompt: safePrompt,
      playlist,
      prefs,
      tags,
      bodyState
    });

    if (aiCopy) {
      intro = aiCopy.intro || intro;
      segue = aiCopy.segue || segue;
      playlist = playlist.map((track, index) => ({
        ...track,
        reason: aiCopy.reasons?.[index] || track.reason
      }));
      source = "openai";
    }
  } catch (error) {
    console.warn("[musio] Falling back to heuristic DJ copy:", error.message);
  }

  return {
    id: `plan-${Date.now()}`,
    prompt: safePrompt,
    intro,
    segue,
    source,
    tags,
    bodyState,
    musicSource,
    playlist,
    generatedAt: new Date().toISOString(),
    tastePresets
  };
}
