export const mockOuraProfiles = [
  {
    id: "recovery-low",
    label: "Recovery Low",
    readinessScore: 61,
    sleepScore: 68,
    sleepHours: 5.8,
    restingHr: 63,
    hrv: 19,
    temperatureDelta: 0.3,
    energyMode: "gentle",
    focusMode: "soft-landing",
    summary: "Recovery is lower today, so the set should stay softer and less stimulating."
  },
  {
    id: "steady-focus",
    label: "Steady Focus",
    readinessScore: 77,
    sleepScore: 79,
    sleepHours: 7.1,
    restingHr: 56,
    hrv: 32,
    temperatureDelta: 0,
    energyMode: "steady",
    focusMode: "deep-focus",
    summary: "Your state is steady, which works well for focused, clean, uninterrupted listening."
  },
  {
    id: "high-readiness",
    label: "High Readiness",
    readinessScore: 89,
    sleepScore: 91,
    sleepHours: 8.1,
    restingHr: 50,
    hrv: 48,
    temperatureDelta: -0.1,
    energyMode: "lift",
    focusMode: "momentum",
    summary: "Recovery looks strong, so we can push toward brighter and more forward-moving choices."
  },
  {
    id: "late-night",
    label: "Late Night",
    readinessScore: 70,
    sleepScore: 64,
    sleepHours: 6.2,
    restingHr: 59,
    hrv: 25,
    temperatureDelta: 0.2,
    energyMode: "wind-down",
    focusMode: "night-drive",
    summary: "Sleep was not perfect, but the mood space is still there for a slow, cinematic night set."
  }
];

export function getDefaultMockOuraProfile() {
  return mockOuraProfiles[1];
}

export function getMockOuraProfile(profileId) {
  return (
    mockOuraProfiles.find((profile) => profile.id === profileId) ||
    getDefaultMockOuraProfile()
  );
}

function evaluateModifiers(profile) {
  let recoveryBoost = 0;
  let strainPenalty = 0;
  const signals = [];

  if (profile.hrv <= 22) {
    strainPenalty += 2;
    signals.push("Low HRV is asking for a softer arc.");
  } else if (profile.hrv <= 30) {
    strainPenalty += 1;
    signals.push("HRV is a bit compressed, so pacing stays measured.");
  } else if (profile.hrv >= 42) {
    recoveryBoost += 1;
    signals.push("HRV is strong, so the set can carry more motion.");
  }

  if (profile.restingHr >= 62) {
    strainPenalty += 1;
    signals.push("Resting HR is elevated, so stimulation stays capped.");
  } else if (profile.restingHr <= 52) {
    recoveryBoost += 1;
    signals.push("Resting HR is calm, which supports a more confident pace.");
  }

  if (profile.temperatureDelta >= 0.3) {
    strainPenalty += 1;
    signals.push("Temperature is slightly elevated, so Musio stays conservative.");
  } else if (profile.temperatureDelta <= -0.1) {
    recoveryBoost += 1;
    signals.push("Temperature is neutral to cool, which supports a brighter lane.");
  }

  return { recoveryBoost, strainPenalty, signals };
}

function formatTemperatureDelta(value) {
  if (!Number.isFinite(value)) {
    return "-";
  }

  return `${value > 0 ? "+" : ""}${value.toFixed(1)} C`;
}

function buildDecisionTrace(profile, mode, modifiers) {
  const readinessEffect =
    profile.readinessScore >= 85
      ? `selects high-readiness lane before modifiers`
      : profile.readinessScore >= 72
        ? `selects steady-readiness lane before modifiers`
        : `selects recovery-first lane before modifiers`;

  const hrvEffect =
    profile.hrv <= 22
      ? "strongly softens the arc"
      : profile.hrv <= 30
        ? "keeps pacing measured"
        : profile.hrv >= 42
          ? "allows more motion"
          : "neutral modifier";

  const restingHrEffect =
    profile.restingHr >= 62
      ? "caps stimulation"
      : profile.restingHr <= 52
        ? "supports a more confident pace"
        : "neutral modifier";

  const temperatureEffect =
    profile.temperatureDelta >= 0.3
      ? "keeps the set conservative"
      : profile.temperatureDelta <= -0.1
        ? "supports a brighter lane"
        : "neutral modifier";

  return {
    result: mode.label,
    playbackBehavior: `${mode.transitionStyle}, ${mode.stimulationCap} stimulation cap, ${mode.arcPhases.map((phase) => phase.label).join(" -> ")}`,
    modifierScore: {
      recoveryBoost: modifiers.recoveryBoost,
      strainPenalty: modifiers.strainPenalty
    },
    signals: [
      {
        label: "Readiness",
        role: "Primary",
        value: `${profile.readinessScore}`,
        effect: readinessEffect
      },
      {
        label: "HRV",
        role: "Secondary",
        value: profile.hrv ? `${profile.hrv} ms` : "-",
        effect: hrvEffect
      },
      {
        label: "Resting HR",
        role: "Secondary",
        value: profile.restingHr ? `${profile.restingHr} bpm` : "-",
        effect: restingHrEffect
      },
      {
        label: "Temp deviation",
        role: "Secondary",
        value: formatTemperatureDelta(profile.temperatureDelta),
        effect: temperatureEffect
      }
    ]
  };
}

export function toBodyState(profile) {
  const recoveryBand =
    profile.readinessScore >= 85 ? "high" : profile.readinessScore >= 72 ? "steady" : "low";
  const modifiers = evaluateModifiers(profile);

  let mode = {
    id: "steady-focus",
    label: "Steady Focus",
    summary: "Hold distraction down, keep the floor stable, and let motion arrive gradually.",
    djTone: "clear",
    transitionStyle: "clean fades",
    stimulationCap: "moderate",
    recommendedTags: ["study", "calm"],
    suppressedTags: ["bright"],
    tempoWindow: { min: 78, max: 112 },
    arcPhases: [
      { id: "settle", label: "Quiet Start", targetEnergy: "low", goal: "Reduce noise and create a stable focus lane." },
      { id: "lock", label: "Lock In", targetEnergy: "low", goal: "Keep attention steady and uncluttered." },
      { id: "motion", label: "Clean Motion", targetEnergy: "medium", goal: "Add subtle movement without breaking concentration." },
      { id: "air", label: "Open Window", targetEnergy: "medium", goal: "End with a little lift while keeping the room clean." }
    ],
    influenceNotes: [
      "Favors focus-first sequencing over instant payoff.",
      "Keeps the energy climb gradual and even.",
      "Uses a clearer, less chatty DJ tone."
    ]
  };

  if (profile.id === "late-night") {
    mode = {
      id: "night-drift",
      label: "Night Drift",
      summary: "Stay cinematic and nocturnal, with a slow pulse in the middle and a softer landing at the end.",
      djTone: "hushed",
      transitionStyle: "long fades",
      stimulationCap: "low",
      recommendedTags: ["night", "cinematic", "calm"],
      suppressedTags: ["bright", "morning"],
      tempoWindow: { min: 72, max: 104 },
      arcPhases: [
        { id: "afterglow", label: "Afterglow", targetEnergy: "low", goal: "Open with atmosphere and leave plenty of negative space." },
        { id: "roadline", label: "Roadline", targetEnergy: "low", goal: "Keep the body moving without over-lighting the scene." },
        { id: "neon", label: "Neon Pulse", targetEnergy: "medium", goal: "Introduce a small pulse right at the center." },
        { id: "fade", label: "Fade Out", targetEnergy: "low", goal: "Let the final stretch exhale instead of pushing harder." }
      ],
      influenceNotes: [
        "Keeps the set dimmer, slower, and more cinematic.",
        "Allows only a small mid-set pulse.",
        "Uses a quieter DJ voice and longer handoffs."
      ]
    };
  } else if (recoveryBand === "low") {
    mode = {
      id: "recovery-reset",
      label: "Recovery Reset",
      summary: "Protect recovery first, keep stimulation low, and add only a measured amount of motion late in the set.",
      djTone: "gentle",
      transitionStyle: "soft handoffs",
      stimulationCap: "low",
      recommendedTags: ["calm", "rain", "study"],
      suppressedTags: ["bright", "groove"],
      tempoWindow: { min: 70, max: 102 },
      arcPhases: [
        { id: "land", label: "Soft Landing", targetEnergy: "low", goal: "Help the nervous system settle before asking for motion." },
        { id: "breathe", label: "Breathing Room", targetEnergy: "low", goal: "Keep pressure off and preserve attention." },
        { id: "pulse", label: "Subtle Pulse", targetEnergy: "low", goal: "Bring in rhythm carefully without spiking stimulation." },
        { id: "lift", label: "Gentle Lift", targetEnergy: "medium", goal: "Finish with a small rise, not a hard push." }
      ],
      influenceNotes: [
        "Protects recovery by capping stimulation early.",
        "Keeps the queue mostly low-energy.",
        "Uses more reassuring and softer DJ language."
      ]
    };
  } else if (recoveryBand === "high") {
    mode = {
      id: "momentum-lift",
      label: "Momentum Lift",
      summary: "Recovery is strong, so the set can brighten faster and carry more forward motion from the start.",
      djTone: "bright",
      transitionStyle: "tight cuts",
      stimulationCap: "medium",
      recommendedTags: ["bright", "groove", "drive"],
      suppressedTags: ["rain"],
      tempoWindow: { min: 92, max: 124 },
      arcPhases: [
        { id: "warm", label: "Warm Start", targetEnergy: "medium", goal: "Open with confidence instead of easing in too slowly." },
        { id: "forward", label: "Forward Motion", targetEnergy: "medium", goal: "Keep the body leaning into the set." },
        { id: "rise", label: "Pulse Rise", targetEnergy: "medium", goal: "Push brightness and movement together." },
        { id: "finish", label: "Bright Finish", targetEnergy: "medium", goal: "End with momentum still intact." }
      ],
      influenceNotes: [
        "Lets the queue climb faster and shine brighter.",
        "Rewards tracks with more propulsion and lift.",
        "Uses a more confident, forward-moving DJ tone."
      ]
    };
  }

  if (profile.id !== "late-night") {
    if (recoveryBand === "high" && modifiers.strainPenalty >= 2) {
      mode = {
        id: "steady-focus",
        label: "Steady Focus",
        summary: "Readiness is high, but the body signals still call for a cleaner, more measured climb.",
        djTone: "clear",
        transitionStyle: "clean fades",
        stimulationCap: "moderate",
        recommendedTags: ["study", "calm"],
        suppressedTags: ["bright"],
        tempoWindow: { min: 82, max: 112 },
        arcPhases: [
          { id: "settle", label: "Quiet Start", targetEnergy: "low", goal: "Start clean instead of charging too early." },
          { id: "lock", label: "Lock In", targetEnergy: "low", goal: "Keep the body and attention channel steady." },
          { id: "motion", label: "Clean Motion", targetEnergy: "medium", goal: "Add motion carefully once the floor is stable." },
          { id: "air", label: "Open Window", targetEnergy: "medium", goal: "Finish brighter, but still controlled." }
        ],
        influenceNotes: [
          "Readiness is positive, but secondary stress signals are holding the set in check.",
          "The arc still lifts, but with more restraint than Momentum Lift.",
          "DJ tone stays clearer and less pushy."
        ]
      };
    }

    if (recoveryBand === "steady" && modifiers.recoveryBoost >= 2 && modifiers.strainPenalty === 0) {
      mode = {
        id: "momentum-lift",
        label: "Momentum Lift",
        summary: "Readiness is steady, and the modifier signals are clean enough to allow a brighter, more confident set.",
        djTone: "bright",
        transitionStyle: "tight cuts",
        stimulationCap: "medium",
        recommendedTags: ["bright", "groove", "drive"],
        suppressedTags: ["rain"],
        tempoWindow: { min: 90, max: 122 },
        arcPhases: [
          { id: "warm", label: "Warm Start", targetEnergy: "medium", goal: "Open with more confidence than a usual steady day." },
          { id: "forward", label: "Forward Motion", targetEnergy: "medium", goal: "Keep the pulse leaning ahead." },
          { id: "rise", label: "Pulse Rise", targetEnergy: "medium", goal: "Let brightness and movement arrive together." },
          { id: "finish", label: "Bright Finish", targetEnergy: "medium", goal: "Close with momentum still present." }
        ],
        influenceNotes: [
          "Readiness is steady, but secondary recovery signals are strong enough to brighten the lane.",
          "The queue can move earlier and feel more confident.",
          "DJ tone becomes more forward-moving."
        ]
      };
    }
  }

  mode = {
    ...mode,
    influenceNotes: [
      `Primary driver: readiness ${profile.readinessScore}.`,
      ...modifiers.signals,
      ...(mode.influenceNotes || [])
    ].slice(0, 6)
  };

  const decisionTrace = buildDecisionTrace(profile, mode, modifiers);

  return {
    source: "mock-oura",
    profileId: profile.id,
    label: profile.label,
    summary: profile.summary,
    recoveryBand,
    energyMode: profile.energyMode,
    focusMode: profile.focusMode,
    modeId: mode.id,
    modeLabel: mode.label,
    modeSummary: mode.summary,
    djTone: mode.djTone,
    transitionStyle: mode.transitionStyle,
    stimulationCap: mode.stimulationCap,
    recommendedTags: mode.recommendedTags,
    suppressedTags: mode.suppressedTags,
    tempoWindow: mode.tempoWindow,
    arcPhases: mode.arcPhases,
    influenceNotes: mode.influenceNotes,
    decisionTrace,
    decisionInputs: {
      primary: {
        readinessScore: profile.readinessScore
      },
      secondary: {
        hrv: profile.hrv,
        restingHr: profile.restingHr,
        temperatureDelta: profile.temperatureDelta
      }
    },
    metrics: {
      readinessScore: profile.readinessScore,
      sleepScore: profile.sleepScore,
      sleepHours: profile.sleepHours,
      restingHr: profile.restingHr,
      hrv: profile.hrv,
      temperatureDelta: profile.temperatureDelta
    }
  };
}

function formatHours(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return 0;
  }
  return Math.round((seconds / 3600) * 10) / 10;
}

function pickLatestRecord(payload) {
  const items = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
  return [...items].sort((left, right) => {
    const leftKey = left.day || left.timestamp || left.id || "";
    const rightKey = right.day || right.timestamp || right.id || "";
    return String(rightKey).localeCompare(String(leftKey));
  })[0] || null;
}

function buildDateRange(daysBack = 3) {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - daysBack);
  const toIso = (value) => value.toISOString().slice(0, 10);
  return {
    startDate: toIso(start),
    endDate: toIso(end)
  };
}

function chooseLiveTemplate(metrics) {
  const pseudoProfile = {
    id: "live-eval",
    hrv: metrics.hrv,
    restingHr: metrics.restingHr,
    temperatureDelta: metrics.temperatureDelta,
    readinessScore: metrics.readinessScore
  };
  const modifiers = evaluateModifiers(pseudoProfile);

  if (metrics.readinessScore >= 85 && modifiers.strainPenalty < 2) {
    return getMockOuraProfile("high-readiness");
  }

  if (metrics.readinessScore < 72) {
    return getMockOuraProfile("recovery-low");
  }

  if (metrics.readinessScore >= 72 && metrics.readinessScore < 85 && modifiers.recoveryBoost >= 2 && modifiers.strainPenalty === 0) {
    return getMockOuraProfile("high-readiness");
  }

  return getMockOuraProfile("steady-focus");
}

export function hasLiveOuraToken() {
  return Boolean(process.env.OURA_PERSONAL_ACCESS_TOKEN);
}

async function fetchOuraCollection(pathname, token, range) {
  const baseUrl = process.env.OURA_API_BASE_URL || "https://api.ouraring.com";
  const url = new URL(pathname, baseUrl);
  url.searchParams.set("start_date", range.startDate);
  url.searchParams.set("end_date", range.endDate);

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Oura API failed for ${pathname}: ${response.status} ${detail}`);
  }

  return response.json();
}

export async function fetchLiveOuraState() {
  const token = process.env.OURA_PERSONAL_ACCESS_TOKEN;
  if (!token) {
    return null;
  }

  const range = buildDateRange();
  const [readinessPayload, sleepPayload] = await Promise.all([
    fetchOuraCollection("/v2/usercollection/daily_readiness", token, range),
    fetchOuraCollection("/v2/usercollection/daily_sleep", token, range)
  ]);

  const readiness = pickLatestRecord(readinessPayload);
  const sleep = pickLatestRecord(sleepPayload);

  if (!readiness && !sleep) {
    throw new Error("Oura returned no recent readiness or sleep records.");
  }

  const metrics = {
    readinessScore: Number(readiness?.score || 0),
    sleepScore: Number(sleep?.score || 0),
    sleepHours: formatHours(sleep?.total_sleep_duration),
    restingHr: Number(
      sleep?.lowest_resting_heart_rate ??
      sleep?.resting_heart_rate ??
      0
    ),
    hrv: Number(
      sleep?.average_hrv ??
      sleep?.hrv ??
      0
    ),
    temperatureDelta: Number(
      sleep?.temperature_deviation ??
      sleep?.body_temperature_delta ??
      0
    )
  };

  const template = chooseLiveTemplate(metrics);
  const liveProfile = {
    ...template,
    id: "live-oura",
    label: "Live Oura",
    summary: "Using your latest Oura readiness and recovery signals to drive the station mode.",
    readinessScore: metrics.readinessScore,
    sleepScore: metrics.sleepScore,
    sleepHours: metrics.sleepHours,
    restingHr: metrics.restingHr,
    hrv: metrics.hrv,
    temperatureDelta: metrics.temperatureDelta
  };

  const bodyState = {
    ...toBodyState(liveProfile),
    source: "oura-live",
    profileId: "live-oura",
    label: "Live Oura",
    summary: "Using your latest Oura readiness and recovery signals to drive the station mode.",
    lastSyncedDay: readiness?.day || sleep?.day || null,
    syncedAt: new Date().toISOString()
  };

  return {
    mode: "live",
    selectedProfileId: null,
    availableProfiles: [],
    bodyState
  };
}

export async function resolveOuraState(storedOuraState) {
  const tokenConfigured = hasLiveOuraToken();

  if (hasLiveOuraToken()) {
    try {
      const liveState = await fetchLiveOuraState();
      if (liveState) {
        return liveState;
      }
    } catch (error) {
      console.warn("[musio] Falling back to mock Oura state:", error.message);
    }
  }

  const selectedProfile = getMockOuraProfile(storedOuraState?.selectedProfileId);
  return {
    ...storedOuraState,
    mode: storedOuraState?.mode || "mock",
    liveTokenConfigured: tokenConfigured,
    liveFallbackReason: tokenConfigured
      ? "Live Oura token was found, but Musio could not read recent Oura daily data. Check the server terminal for the Oura API error."
      : "No Oura personal access token is configured for this server process.",
    availableProfiles: mockOuraProfiles,
    bodyState: toBodyState(selectedProfile)
  };
}
