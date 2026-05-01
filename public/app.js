const SPOTIFY_STORAGE_KEYS = {
  clientId: "musio.spotify.client_id",
  accessToken: "musio.spotify.access_token",
  expiresAt: "musio.spotify.expires_at",
  codeVerifier: "musio.spotify.code_verifier",
  authState: "musio.spotify.auth_state"
};

let spotifySdkPromise = null;

const state = {
  plan: null,
  history: [],
  quickPrompts: [],
  oura: null,
  currentIndex: 0,
  isPlaying: false,
  audio: new Audio(),
  synth: null,
  speechEnabled: "speechSynthesis" in window,
  spotify: {
    clientId: localStorage.getItem(SPOTIFY_STORAGE_KEYS.clientId) || "",
    accessToken: localStorage.getItem(SPOTIFY_STORAGE_KEYS.accessToken) || "",
    expiresAt: Number(localStorage.getItem(SPOTIFY_STORAGE_KEYS.expiresAt) || "0"),
    playlistUrl: "",
    profile: null,
    matchResults: [],
    reviewSummary: "Review will show which tracks matched cleanly before you save.",
    player: null,
    deviceId: "",
    sdkReady: false,
    sdkLoading: false,
    usingSdkPlayback: false,
    usingExternalPlayback: false,
    progressTimer: null,
    currentSourceIndex: -1,
    playbackErrorSkips: 0,
    device: null,
    deviceCheckedAt: 0,
    devicePollTimer: null,
    devicePollAttempts: 0
  }
};

const elements = {
  promptInput: document.querySelector("#promptInput"),
  quickPromptList: document.querySelector("#quickPromptList"),
  randomPromptButton: document.querySelector("#randomPromptButton"),
  planButton: document.querySelector("#planButton"),
  statusText: document.querySelector("#statusText"),
  stationStatus: document.querySelector("#stationStatus"),
  ouraModeBadge: document.querySelector("#ouraModeBadge"),
  recoveryTitle: document.querySelector("#recoveryTitle"),
  ouraSummaryText: document.querySelector("#ouraSummaryText"),
  bodyModeTitle: document.querySelector("#bodyModeTitle"),
  bodyModeSummary: document.querySelector("#bodyModeSummary"),
  ouraInfluenceList: document.querySelector("#ouraInfluenceList"),
  decisionResult: document.querySelector("#decisionResult"),
  decisionTraceList: document.querySelector("#decisionTraceList"),
  decisionBehavior: document.querySelector("#decisionBehavior"),
  ouraMetricsGrid: document.querySelector("#ouraMetricsGrid"),
  ouraProfileList: document.querySelector("#ouraProfileList"),
  introText: document.querySelector("#introText"),
  segueText: document.querySelector("#segueText"),
  sourceBadge: document.querySelector("#sourceBadge"),
  queueList: document.querySelector("#queueList"),
  tagList: document.querySelector("#tagList"),
  historyList: document.querySelector("#historyList"),
  nowPlayingTitle: document.querySelector("#nowPlayingTitle"),
  nowPlayingArtist: document.querySelector("#nowPlayingArtist"),
  trackLink: document.querySelector("#trackLink"),
  progressFill: document.querySelector("#progressFill"),
  progressTime: document.querySelector("#progressTime"),
  musicSourceText: document.querySelector("#musicSourceText"),
  playButton: document.querySelector("#playButton"),
  prevButton: document.querySelector("#prevButton"),
  nextButton: document.querySelector("#nextButton"),
  speakButton: document.querySelector("#speakButton"),
  coverDisc: document.querySelector("#coverDisc"),
  playbackDeviceRow: document.querySelector("#playbackDeviceRow"),
  playbackDeviceText: document.querySelector("#playbackDeviceText"),
  openSpotifyButton: document.querySelector("#openSpotifyButton"),
  spotifyStatusText: document.querySelector("#spotifyStatusText"),
  spotifyClientIdInput: document.querySelector("#spotifyClientIdInput"),
  spotifyRedirectText: document.querySelector("#spotifyRedirectText"),
  spotifyAuthButton: document.querySelector("#spotifyAuthButton"),
  spotifyLogoutButton: document.querySelector("#spotifyLogoutButton"),
  spotifyReviewButton: document.querySelector("#spotifyReviewButton"),
  spotifyCheckButton: document.querySelector("#spotifyCheckButton"),
  spotifyPlaylistButton: document.querySelector("#spotifyPlaylistButton"),
  spotifyReviewSummary: document.querySelector("#spotifyReviewSummary"),
  spotifyReviewList: document.querySelector("#spotifyReviewList"),
  spotifyPlaylistLink: document.querySelector("#spotifyPlaylistLink")
};

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${mins}:${secs}`;
}

function setStatus(text) {
  elements.statusText.textContent = text;
  elements.stationStatus.textContent = text;
}

function syncPlaybackState() {
  document.body.dataset.playing = state.isPlaying ? "true" : "false";
  elements.playButton.textContent = state.isPlaying ? "❚❚" : "▶";
  elements.coverDisc.classList.toggle("spinning", state.isPlaying);
}

function setSpotifyPanelStatus(text) {
  elements.spotifyStatusText.textContent = text;
}

function resetSpotifySdkState(message = "") {
  if (state.spotify.player) {
    state.spotify.player.disconnect();
  }

  spotifySdkPromise = null;
  state.spotify.player = null;
  state.spotify.deviceId = "";
  state.spotify.sdkReady = false;
  state.spotify.sdkLoading = false;
  state.spotify.usingSdkPlayback = false;
  if (!window.Spotify?.Player) {
    document.querySelector('script[src="https://sdk.scdn.co/spotify-player.js"]')?.remove();
  }
  if (message) {
    setSpotifyPanelStatus(message);
  }
}

async function appendRuntimeDiagnostics(message) {
  try {
    const response = await fetch("/api/runtime");
    const runtime = await response.json();
    const components = runtime.electronRuntime?.components;
    const componentSummary = Array.isArray(components)
      ? components.map((component) => `${component.title || component.name || "component"}:${component.status || component.version || "unknown"}`).join(", ")
      : components
        ? JSON.stringify(components)
        : "not reported";
    setSpotifyPanelStatus(
      `${message} Runtime: Electron ${runtime.electronRuntime?.electron || "unknown"}, Chrome ${runtime.electronRuntime?.chrome || "unknown"}, components: ${componentSummary}.`
    );
  } catch {
    setSpotifyPanelStatus(message);
  }
}

function applyRecoveryTheme(recoveryBand = "steady") {
  document.body.dataset.recovery = recoveryBand;
}

function getRedirectUri() {
  return `${window.location.origin}${window.location.pathname}`;
}

function isDesktopApp() {
  return navigator.userAgent.toLowerCase().includes("electron") || window.location.port === "3060";
}

function hasSpotifySession() {
  return Boolean(state.spotify.accessToken && state.spotify.expiresAt > Date.now());
}

function syncSpotifyStorage() {
  localStorage.setItem(SPOTIFY_STORAGE_KEYS.clientId, state.spotify.clientId);
  if (state.spotify.accessToken) {
    localStorage.setItem(SPOTIFY_STORAGE_KEYS.accessToken, state.spotify.accessToken);
    localStorage.setItem(SPOTIFY_STORAGE_KEYS.expiresAt, String(state.spotify.expiresAt));
  } else {
    localStorage.removeItem(SPOTIFY_STORAGE_KEYS.accessToken);
    localStorage.removeItem(SPOTIFY_STORAGE_KEYS.expiresAt);
  }
}

function resetSpotifyReview(summary = "Review will show which tracks matched cleanly before you save.") {
  state.spotify.matchResults = [];
  state.spotify.reviewSummary = summary;
  state.spotify.playlistUrl = "";
}

function renderSpotifyReview() {
  elements.spotifyReviewSummary.textContent = state.spotify.reviewSummary;

  if (!state.spotify.matchResults.length) {
    elements.spotifyReviewList.innerHTML = "";
    return;
  }

  elements.spotifyReviewList.innerHTML = "";
  state.spotify.matchResults.forEach((result, index) => {
    const spotifyMatch = getSpotifyMatch(result);
    const candidateCount = result.candidates?.length || 0;
    const card = document.createElement("div");
    card.className = `spotify-review-item ${spotifyMatch ? "" : "unmatched"}`;
    const confidenceClass = result.confidence?.level || "low";
    card.innerHTML = `
      <div class="spotify-review-head">
        <div>
          <p class="spotify-review-title">${index + 1}. ${result.sourceTrack.title}</p>
          <p class="spotify-review-copy">${result.sourceTrack.artist}</p>
          <p class="spotify-review-copy">${spotifyMatch ? `${spotifyMatch.name} — ${spotifyMatch.artists.map((artist) => artist.name).join(", ")}${spotifyMatch.is_playable === false ? " · Not playable for this account/market" : ""}${candidateCount > 1 ? ` · ${candidateCount} candidates` : ""}${result.playbackFailed ? ` · Playback failed: ${result.playbackError || "Playback error"}` : ""}` : "No Spotify match found yet."}</p>
        </div>
        <span class="confidence-pill ${confidenceClass}">${spotifyMatch ? result.confidence.label : "Unmatched"}</span>
      </div>
      <p class="spotify-review-copy">${spotifyMatch ? result.confidence.detail : "This item will be skipped unless you regenerate or review again later."}</p>
      <div class="spotify-review-controls">
        <label class="spotify-toggle">
          <input type="checkbox" ${result.selected ? "checked" : ""} ${spotifyMatch && spotifyMatch.is_playable !== false && !result.playbackFailed ? "" : "disabled"} />
          Include in playlist
        </label>
        ${spotifyMatch?.external_urls?.spotify ? `<a class="queue-link" href="${spotifyMatch.external_urls.spotify}" target="_blank" rel="noreferrer">Open in Spotify</a>` : ""}
      </div>
    `;

    const checkbox = card.querySelector('input[type="checkbox"]');
    if (checkbox) {
      checkbox.addEventListener("change", () => {
        result.selected = checkbox.checked;
        updateSpotifyReviewSummary();
        renderSpotifyReview();
      });
    }

    elements.spotifyReviewList.appendChild(card);
  });
}

function renderSpotify() {
  elements.spotifyClientIdInput.value = state.spotify.clientId;
  elements.spotifyRedirectText.textContent =
    isDesktopApp()
      ? `Redirect URI: ${window.location.origin}/api/spotify/callback — add this exact URL to your Spotify app settings.`
      : `Redirect URI: ${getRedirectUri()} — add this exact URL to your Spotify app settings.`;

  if (!state.spotify.clientId) {
    elements.spotifyStatusText.textContent =
      "Add your Spotify Client ID, then connect with PKCE so Musio can create private playlists in your account.";
  } else if (state.spotify.accessToken && state.spotify.expiresAt > Date.now()) {
    if (state.spotify.sdkReady) {
      elements.spotifyStatusText.textContent = state.spotify.profile?.display_name
        ? `Connected as ${state.spotify.profile.display_name}. Spotify playback is ready in Musio.`
        : "Spotify is connected, and full playback is ready in Musio.";
    } else if (state.spotify.sdkLoading) {
      elements.spotifyStatusText.textContent =
        "Spotify is connected. Musio is still preparing the playback device.";
    } else {
      elements.spotifyStatusText.textContent = state.spotify.profile?.display_name
        ? `Connected as ${state.spotify.profile.display_name}. Review matches or start playback to finish preparing Spotify.`
        : "Spotify is connected. Review matches or start playback to finish preparing Spotify.";
    }
  } else {
    elements.spotifyStatusText.textContent =
      "Spotify is configured but not connected. Click Connect Spotify to authorize this app.";
  }

  if (state.spotify.playlistUrl) {
    elements.spotifyPlaylistLink.href = state.spotify.playlistUrl;
    elements.spotifyPlaylistLink.classList.remove("hidden");
  } else {
    elements.spotifyPlaylistLink.classList.add("hidden");
  }

  renderSpotifyReview();
}

function renderPlaybackDevice(device = null) {
  state.spotify.device = device;
  state.spotify.deviceCheckedAt = device ? Date.now() : state.spotify.deviceCheckedAt;
  if (!hasSpotifySession()) {
    elements.playbackDeviceRow.classList.add("hidden");
    return;
  }

  elements.playbackDeviceRow.classList.remove("hidden");
  elements.playbackDeviceRow.classList.toggle("ready", Boolean(device));
  elements.openSpotifyButton.classList.toggle("hidden", Boolean(device));
  elements.playbackDeviceText.textContent = device
    ? `Spotify app ready: ${device.name} (${device.type})`
    : "Spotify device not ready. Open Spotify once to enable full playback.";
}

function renderOura() {
  const oura = state.oura;
  if (!oura) {
    return;
  }

  elements.ouraModeBadge.textContent = oura.mode || "mock";
  elements.recoveryTitle.textContent = oura.bodyState?.label || "Steady Focus";
  elements.ouraSummaryText.textContent =
    oura.bodyState?.summary || "Your recovery summary appears here and shapes the set.";
  elements.bodyModeTitle.textContent =
    oura.bodyState?.modeLabel || "Steady Focus";
  elements.bodyModeSummary.textContent =
    oura.bodyState?.modeSummary ||
    "Oura translates your metrics into a station mode, then Musio uses that mode to shape pacing, tone, and track sequencing.";
  renderDecisionTrace(oura.bodyState?.decisionTrace);
  applyRecoveryTheme(oura.bodyState?.recoveryBand || "steady");

  const metrics = oura.bodyState?.metrics || {};
  const metricItems = [
    ["Readiness", metrics.readinessScore ? `${metrics.readinessScore}` : "-"],
    ["HRV", metrics.hrv ? `${metrics.hrv} ms` : "-"],
    ["Resting HR", metrics.restingHr ? `${metrics.restingHr} bpm` : "-"],
    [
      "Temp",
      Number.isFinite(metrics.temperatureDelta)
        ? `${metrics.temperatureDelta > 0 ? "+" : ""}${metrics.temperatureDelta.toFixed(1)} C`
        : "-"
    ]
  ];

  elements.ouraMetricsGrid.innerHTML = "";
  metricItems.forEach(([label, value]) => {
    const card = document.createElement("div");
    card.className = "metric-card";
    card.innerHTML = `
      <p class="metric-label">${label}</p>
      <p class="metric-value">${value}</p>
    `;
    elements.ouraMetricsGrid.appendChild(card);
  });

  elements.ouraInfluenceList.innerHTML = "";
  [
    "Decision inputs: readiness + HRV + resting HR + temp deviation",
    oura.bodyState?.djTone ? `DJ tone: ${oura.bodyState.djTone}` : "",
    oura.bodyState?.transitionStyle ? `Transitions: ${oura.bodyState.transitionStyle}` : "",
    oura.bodyState?.stimulationCap ? `Stim cap: ${oura.bodyState.stimulationCap}` : "",
    oura.bodyState?.lastSyncedDay ? `Last synced: ${oura.bodyState.lastSyncedDay}` : "",
    oura.mode === "live" ? "Live Oura feed active" : "",
    oura.mode !== "live" && oura.liveFallbackReason ? oura.liveFallbackReason : ""
  ]
    .filter(Boolean)
    .forEach((note) => {
      const pill = document.createElement("span");
      pill.className = "influence-pill";
      pill.textContent = note;
      elements.ouraInfluenceList.appendChild(pill);
    });

  (oura.bodyState?.influenceNotes || []).forEach((note) => {
    const pill = document.createElement("span");
    pill.className = "influence-pill";
    pill.textContent = note;
    elements.ouraInfluenceList.appendChild(pill);
  });

  elements.ouraProfileList.innerHTML = "";
  if (oura.mode === "live") {
    return;
  }

  (oura.availableProfiles || []).forEach((profile) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `chip ${profile.id === oura.selectedProfileId ? "active" : ""}`;
    button.textContent = profile.label;
    button.addEventListener("click", () => updateMockOura(profile.id));
    elements.ouraProfileList.appendChild(button);
  });
}

function renderDecisionTrace(trace) {
  elements.decisionResult.textContent = trace?.result || "Pending";
  elements.decisionBehavior.textContent = trace?.playbackBehavior
    ? `Playback behavior: ${trace.playbackBehavior}`
    : "Playback behavior will appear after Oura loads.";
  elements.decisionTraceList.innerHTML = "";

  (trace?.signals || []).forEach((signal) => {
    const row = document.createElement("div");
    row.className = "decision-row";
    row.innerHTML = `
      <div>
        <p class="decision-signal">${signal.label}</p>
        <p class="decision-role">${signal.role}</p>
      </div>
      <p class="decision-value">${signal.value}</p>
      <p class="decision-effect">${signal.effect}</p>
    `;
    elements.decisionTraceList.appendChild(row);
  });
}

function renderQuickPrompts() {
  elements.quickPromptList.innerHTML = "";
  state.quickPrompts.forEach((prompt) => {
    const button = document.createElement("button");
    button.className = "chip";
    button.type = "button";
    button.textContent = prompt;
    button.addEventListener("click", () => {
      elements.promptInput.value = prompt;
      [...elements.quickPromptList.children].forEach((child) => {
        child.classList.toggle("active", child === button);
      });
    });
    elements.quickPromptList.appendChild(button);
  });
}

function renderHistory() {
  if (state.history.length === 0) {
    elements.historyList.innerHTML =
      `<div class="history-item"><p class="history-copy">No history yet. Generate your first DJ set to start building a trail.</p></div>`;
    return;
  }

  elements.historyList.innerHTML = "";
  state.history.forEach((item) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "history-item";
    card.innerHTML = `
      <div class="history-meta">
        <div>
          <p class="history-title">${item.prompt}</p>
          <p class="history-copy">${item.tags.join(" / ")} · ${item.source}${item.ouraProfileId ? ` · ${item.ouraProfileId}` : ""}</p>
        </div>
      </div>
    `;
    card.addEventListener("click", () => {
      elements.promptInput.value = item.prompt;
    });
    elements.historyList.appendChild(card);
  });
}

function renderQueue() {
  const playlist = state.plan?.playlist || [];

  if (playlist.length === 0) {
    elements.queueList.innerHTML =
      `<div class="queue-item"><p class="queue-subtitle">Generate a set and the queue will appear here with track context and handoff notes.</p></div>`;
    return;
  }

  elements.queueList.innerHTML = "";
  playlist.forEach((track, index) => {
    const card = document.createElement("div");
    card.className = `queue-item ${index === state.currentIndex ? "active" : ""}`;
    card.tabIndex = 0;
    card.innerHTML = `
      <div class="queue-meta">
        <div>
          <p class="queue-title">${track.queueIndex}. ${track.title}</p>
          <p class="queue-subtitle">${track.artist} · ${formatTime(track.durationSec)}${track.phaseLabel ? ` · ${track.phaseLabel}` : ""}</p>
        </div>
        <span class="queue-pill" style="background:${track.color};">${track.energy}</span>
      </div>
      <p class="queue-reason">${track.reason}</p>
      ${track.trackViewUrl ? `<a class="queue-link" href="${track.trackViewUrl}" target="_blank" rel="noreferrer">Open source track</a>` : ""}
    `;
    card.addEventListener("click", () => {
      state.currentIndex = index;
      stopPlayback();
      renderPlan();
    });
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        state.currentIndex = index;
        stopPlayback();
        renderPlan();
      }
    });
    const trackLink = card.querySelector(".queue-link");
    if (trackLink) {
      trackLink.addEventListener("click", (event) => event.stopPropagation());
    }
    elements.queueList.appendChild(card);
  });
}

function renderNowPlaying() {
  const currentTrack = state.plan?.playlist?.[state.currentIndex];
  if (!currentTrack) {
    elements.nowPlayingTitle.textContent = "Waiting for a set";
    elements.nowPlayingArtist.textContent = "Musio will choose the opening record for you.";
    elements.trackLink.classList.add("hidden");
    elements.progressFill.style.width = "0%";
    elements.progressTime.textContent = "0:00 / 0:00";
    elements.coverDisc.style.backgroundImage = "";
    return;
  }

  elements.nowPlayingTitle.textContent = currentTrack.title;
  elements.nowPlayingArtist.textContent =
    `${currentTrack.artist}${currentTrack.phaseLabel ? ` · ${currentTrack.phaseLabel}` : ""} · ${currentTrack.reason}`;

  const spotifyMatch = getMatchResultForSourceIndex(state.currentIndex);
  const activeSpotifyMatch = getSpotifyMatch(spotifyMatch);
  if (activeSpotifyMatch?.external_urls?.spotify && state.spotify.sdkReady) {
    elements.trackLink.href = activeSpotifyMatch.external_urls.spotify;
    elements.trackLink.textContent = "Open in Spotify";
    elements.trackLink.classList.remove("hidden");
  } else if (currentTrack.trackViewUrl) {
    elements.trackLink.href = currentTrack.trackViewUrl;
    elements.trackLink.textContent = currentTrack.attribution || "Open in Apple";
    elements.trackLink.classList.remove("hidden");
  } else {
    elements.trackLink.classList.add("hidden");
  }

  if (currentTrack.artworkUrl) {
    elements.coverDisc.style.backgroundImage = `url(${currentTrack.artworkUrl})`;
    elements.coverDisc.style.backgroundSize = "cover";
    elements.coverDisc.style.backgroundPosition = "center";
  } else {
    elements.coverDisc.style.backgroundImage = "";
  }

  elements.progressTime.textContent = `0:00 / ${formatTime(currentTrack.durationSec)}`;
  elements.progressFill.style.width = "0%";
}

function renderPlan() {
  elements.introText.textContent =
    state.plan?.intro || "Describe a mood and Musio will return a DJ intro plus a four-track queue.";
  elements.segueText.textContent = state.plan?.segue || "Transitions will appear here.";
  elements.sourceBadge.textContent = state.plan?.bodyState
    ? `${state.plan?.source || "heuristic"} + oura`
    : state.plan?.source || "heuristic";
  elements.tagList.textContent = state.plan?.tags?.join(" · ") || "-";
  elements.musicSourceText.textContent =
    state.spotify.sdkReady && state.spotify.accessToken
      ? "Spotify is connected for full-length playback inside Musio. If a track cannot be matched cleanly, Musio falls back to preview mode."
      : state.plan?.musicSource === "apple-preview"
        ? "This queue is using Apple iTunes song previews for playback. If the lookup fails, Musio falls back to the local demo crate."
      : state.plan?.musicSource === "local-fallback"
        ? "The network lookup missed, so Musio fell back to the local demo crate."
        : "There is no queue yet.";

  if (state.plan?.bodyState?.recoveryBand) {
    applyRecoveryTheme(state.plan.bodyState.recoveryBand);
  }

  renderQueue();
  renderNowPlaying();
}

function randomizePrompt() {
  const prompt = state.quickPrompts[Math.floor(Math.random() * state.quickPrompts.length)];
  elements.promptInput.value = prompt;
}

function containsHanText(value) {
  return /[\p{Script=Han}]/u.test(String(value || ""));
}

function normalizeMatchText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getSpotifyMatch(result) {
  return result?.activeMatch || result?.match || null;
}

function getSpotifyMatchUri(result) {
  return getSpotifyMatch(result)?.uri || "";
}

function getSelectedSpotifyMatches() {
  return state.spotify.matchResults.filter((result) => {
    const match = getSpotifyMatch(result);
    return result.selected && !result.playbackFailed && match?.uri && match.is_playable !== false;
  });
}

function getMatchResultForSourceIndex(sourceIndex) {
  return state.spotify.matchResults.find((result) => result.sourceIndex === sourceIndex) || null;
}

function getNextMatchedSourceIndex(fromIndex, step = 1) {
  const playlistLength = state.plan?.playlist?.length || 0;
  if (!playlistLength) {
    return -1;
  }

  for (let offset = 0; offset < playlistLength; offset += 1) {
    const candidate = (fromIndex + step * offset + playlistLength) % playlistLength;
    const match = getMatchResultForSourceIndex(candidate);
    const spotifyMatch = getSpotifyMatch(match);
    if (match?.selected && !match.playbackFailed && spotifyMatch?.uri && spotifyMatch.is_playable !== false) {
      return candidate;
    }
  }

  return -1;
}

function scoreSpotifyMatch(sourceTrack, match) {
  const sourceTitle = normalizeMatchText(sourceTrack.title);
  const sourceArtist = normalizeMatchText(sourceTrack.artist);
  const matchTitle = normalizeMatchText(match?.name);
  const matchArtists = normalizeMatchText(
    match?.artists?.map((artist) => artist.name).join(" ")
  );

  let score = 0;
  if (sourceTitle && matchTitle === sourceTitle) {
    score += 65;
  } else if (sourceTitle && matchTitle.includes(sourceTitle)) {
    score += 45;
  }

  if (sourceArtist && matchArtists.includes(sourceArtist)) {
    score += 35;
  }

  if (score >= 90) {
    return {
      score,
      level: "high",
      label: "High confidence",
      detail: "Title and artist are closely aligned with the Musio queue item."
    };
  }

  if (score >= 55) {
    return {
      score,
      level: "medium",
      label: "Medium confidence",
      detail: "The match is usable, but one of the fields is looser than ideal."
    };
  }

  return {
    score,
    level: "low",
    label: "Low confidence",
    detail: "This looks like a weaker match. Review before saving."
  };
}

function updateSpotifyReviewSummary() {
  const total = state.spotify.matchResults.length;
  const matched = state.spotify.matchResults.filter((result) => result.match).length;
  const selected = state.spotify.matchResults.filter((result) => result.selected && result.match).length;
  const unmatched = total - matched;
  state.spotify.reviewSummary =
    total === 0
      ? "Review will show which tracks matched cleanly before you save."
      : `${matched}/${total} tracks matched Spotify. ${selected} selected for save.${unmatched ? ` ${unmatched} still unmatched.` : ""}`;
}

async function ensureSpotifySdk() {
  if (state.spotify.player && state.spotify.sdkReady) {
    return state.spotify.player;
  }

  if (!state.spotify.accessToken || state.spotify.expiresAt <= Date.now()) {
    throw new Error("Spotify session expired. Please connect again.");
  }

  if (!spotifySdkPromise) {
    spotifySdkPromise = new Promise((resolve, reject) => {
      let settled = false;
      let sdkTimer = null;
      const fail = (error) => {
        if (settled) {
          return;
        }
        settled = true;
        window.clearTimeout(sdkTimer);
        reject(error);
      };
      const succeed = (player) => {
        if (settled) {
          return;
        }
        settled = true;
        window.clearTimeout(sdkTimer);
        resolve(player);
      };
      sdkTimer = window.setTimeout(() => {
        fail(new Error("Spotify Web Playback SDK did not become ready within 15 seconds."));
      }, 15000);

      const handleReady = () => {
        if (!window.Spotify?.Player) {
          fail(new Error("Spotify Web Playback SDK did not load."));
          return;
        }

        state.spotify.sdkLoading = true;
        renderSpotify();

        const player = new window.Spotify.Player({
          name: "Musio Desktop Player",
          getOAuthToken: (callback) => callback(state.spotify.accessToken),
          volume: 0.8
        });

        player.addListener("ready", ({ device_id: deviceId }) => {
          state.spotify.player = player;
          state.spotify.deviceId = deviceId;
          state.spotify.sdkReady = true;
          state.spotify.sdkLoading = false;
          renderPlaybackDevice({ name: "Musio Desktop Player", type: "This app" });
          renderSpotify();
          succeed(player);
        });

        player.addListener("not_ready", () => {
          state.spotify.sdkReady = false;
          state.spotify.deviceId = "";
          state.spotify.usingSdkPlayback = false;
          renderPlaybackDevice(null);
          renderSpotify();
        });

        player.addListener("initialization_error", ({ message }) => {
          state.spotify.sdkLoading = false;
          setSpotifyPanelStatus(`Spotify initialization error: ${message || "Unknown error"}`);
          fail(new Error(message || "Spotify player initialization failed."));
        });

        player.addListener("authentication_error", ({ message }) => {
          state.spotify.sdkLoading = false;
          setSpotifyPanelStatus(`Spotify authentication error: ${message || "Unknown error"}`);
          fail(new Error(message || "Spotify player authentication failed."));
        });

        player.addListener("account_error", ({ message }) => {
          state.spotify.sdkLoading = false;
          setSpotifyPanelStatus(`Spotify account error: ${message || "Spotify Premium is required for in-app playback."}`);
          fail(new Error(message || "Spotify Premium is required for in-app playback."));
        });

        player.addListener("playback_error", ({ message }) => {
          state.spotify.playbackErrorSkips += 1;
      handleSpotifyPlaybackError(message || "Playback error");
    });

        player.addListener("player_state_changed", (playerState) => {
          if (!playerState) {
            return;
          }

          if (playerState.paused && state.spotify.currentSourceIndex === -1) {
            return;
          }

          state.isPlaying = !playerState.paused;
          syncPlaybackState();

          const currentUri = playerState.track_window?.current_track?.uri;
          const matchedResult = state.spotify.matchResults.find(
            (result) => result.selected && getSpotifyMatchUri(result) === currentUri
          );

          if (matchedResult) {
            state.currentIndex = matchedResult.sourceIndex;
            state.spotify.currentSourceIndex = matchedResult.sourceIndex;
            state.spotify.usingSdkPlayback = true;
            renderQueue();
            renderNowPlaying();
          }

          const durationSec = (playerState.duration || 0) / 1000;
          const positionSec = (playerState.position || 0) / 1000;
          const ratio = durationSec > 0 ? Math.min(1, positionSec / durationSec) : 0;
          elements.progressFill.style.width = `${ratio * 100}%`;
          elements.progressTime.textContent = `${formatTime(positionSec)} / ${formatTime(durationSec)}`;
        });

        player.connect().then((connected) => {
          if (!connected) {
            setSpotifyPanelStatus("Spotify player could not connect.");
            fail(new Error("Spotify player could not connect."));
          }
        }).catch((error) => {
          setSpotifyPanelStatus(`Spotify player connection failed: ${error.message}`);
          fail(error);
        });
      };

      if (window.Spotify?.Player) {
        handleReady();
        return;
      }

      window.onSpotifyWebPlaybackSDKReady = handleReady;
      const existingScript = document.querySelector('script[src="https://sdk.scdn.co/spotify-player.js"]');
      if (existingScript) {
        existingScript.addEventListener("error", () => {
          fail(new Error("Could not load the Spotify Web Playback SDK."));
        }, { once: true });
        return;
      }

      const script = document.createElement("script");
      script.src = "https://sdk.scdn.co/spotify-player.js";
      script.async = true;
      script.onerror = () => {
        setSpotifyPanelStatus("Could not load the Spotify Web Playback SDK.");
        fail(new Error("Could not load the Spotify Web Playback SDK."));
      };
      document.head.appendChild(script);
    }).catch((error) => {
      const message = `Musio internal Spotify player is not ready: ${error.message}`;
      resetSpotifySdkState(message);
      appendRuntimeDiagnostics(message);
      renderSpotify();
      throw error;
    });
  }

  state.spotify.sdkLoading = true;
  renderSpotify();
  return spotifySdkPromise;
}

function buildFrequency(note) {
  const notes = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const match = /^([A-G])([b#]?)(\d)$/.exec(note);
  if (!match) {
    return 220;
  }

  const [, letter, accidental, octaveRaw] = match;
  const octave = Number(octaveRaw);
  let semitone = notes[letter] + (octave + 1) * 12;
  if (accidental === "#") semitone += 1;
  if (accidental === "b") semitone -= 1;
  return 440 * 2 ** ((semitone - 69) / 12);
}

function stopPlayback() {
  if (state.spotify.player && state.spotify.usingSdkPlayback) {
    state.spotify.player.pause().catch(() => {});
    state.spotify.usingSdkPlayback = false;
  }
  if (state.spotify.usingExternalPlayback) {
    spotifyApi("https://api.spotify.com/v1/me/player/pause", {
      method: "PUT"
    }).catch(() => {});
    state.spotify.usingExternalPlayback = false;
  }
  if (state.spotify.progressTimer) {
    clearInterval(state.spotify.progressTimer);
    state.spotify.progressTimer = null;
  }
  state.spotify.currentSourceIndex = -1;

  state.audio.pause();
  state.audio.removeAttribute("src");
  state.audio.load();

  if (state.synth?.timer) {
    clearInterval(state.synth.timer);
  }
  if (state.synth?.cleanup) {
    state.synth.cleanup();
  }

  state.synth = null;
  state.isPlaying = false;
  syncPlaybackState();
  renderQueue();
}

function startSpotifyProgressTimer(track) {
  if (state.spotify.progressTimer) {
    clearInterval(state.spotify.progressTimer);
  }

  const startedAt = Date.now();
  const durationSec = track?.durationSec || 0;
  state.spotify.progressTimer = setInterval(() => {
    const elapsed = Math.min(durationSec, (Date.now() - startedAt) / 1000);
    const ratio = durationSec > 0 ? Math.min(1, elapsed / durationSec) : 0;
    elements.progressFill.style.width = `${ratio * 100}%`;
    elements.progressTime.textContent = `${formatTime(elapsed)} / ${formatTime(durationSec)}`;

    if (durationSec > 0 && elapsed >= durationSec) {
      clearInterval(state.spotify.progressTimer);
      state.spotify.progressTimer = null;
      nextTrack();
    }
  }, 1000);
}

async function findSpotifyPlaybackDevice() {
  const payload = await spotifyApi("https://api.spotify.com/v1/me/player/devices");
  const devices = Array.isArray(payload?.devices) ? payload.devices : [];
  const playableDevices = devices.filter((device) => !device.is_restricted);
  return (
    playableDevices.find((device) => device.is_active) ||
    playableDevices.find((device) => device.type === "Computer") ||
    playableDevices[0] ||
    null
  );
}

async function refreshSpotifyDeviceStatus({ quiet = false } = {}) {
  if (!hasSpotifySession()) {
    renderPlaybackDevice(null);
    return null;
  }

  try {
    const device = await findSpotifyPlaybackDevice();
    renderPlaybackDevice(device);
    if (device && !quiet) {
      setStatus(`Spotify app ready: ${device.name}`);
    }
    return device;
  } catch (error) {
    renderPlaybackDevice(null);
    if (!quiet) {
      setStatus(`Spotify device check failed: ${error.message}`);
    }
    return null;
  }
}

function startSpotifyDevicePolling() {
  if (!hasSpotifySession() || state.spotify.devicePollTimer) {
    return;
  }

  state.spotify.devicePollAttempts = 0;
  refreshSpotifyDeviceStatus({ quiet: true });
  state.spotify.devicePollTimer = window.setInterval(async () => {
    state.spotify.devicePollAttempts += 1;
    const device = await refreshSpotifyDeviceStatus({ quiet: true });
    if (device || state.spotify.devicePollAttempts >= 20) {
      window.clearInterval(state.spotify.devicePollTimer);
      state.spotify.devicePollTimer = null;
    }
  }, 3000);
}

function stopSpotifyDevicePolling() {
  if (state.spotify.devicePollTimer) {
    window.clearInterval(state.spotify.devicePollTimer);
    state.spotify.devicePollTimer = null;
  }
}

function markCurrentSpotifyMatchFailed(message = "Playback error") {
  const currentMatch = getMatchResultForSourceIndex(state.currentIndex);
  if (!currentMatch) {
    return null;
  }

  const currentUri = getSpotifyMatchUri(currentMatch);
  currentMatch.failedUris = Array.from(new Set([...(currentMatch.failedUris || []), currentUri].filter(Boolean)));
  const nextCandidate = (currentMatch.candidates || []).find(
    (candidate) =>
      candidate.uri &&
      candidate.is_playable !== false &&
      !currentMatch.failedUris.includes(candidate.uri)
  );

  if (nextCandidate) {
    currentMatch.match = nextCandidate;
    currentMatch.activeMatch = nextCandidate;
    currentMatch.confidence = scoreSpotifyMatch(currentMatch.sourceTrack, nextCandidate);
    currentMatch.playbackFailed = false;
    currentMatch.playbackError = "";
    currentMatch.selected = true;
    updateSpotifyReviewSummary();
    renderSpotifyReview();
    return currentMatch;
  }

  currentMatch.selected = false;
  currentMatch.playbackFailed = true;
  currentMatch.playbackError = message;
  updateSpotifyReviewSummary();
  renderSpotifyReview();
  return currentMatch;
}

function hasRemainingSpotifyMatch() {
  return getSelectedSpotifyMatches().length > 0;
}

function handleSpotifyPlaybackError(message = "Playback error") {
  state.spotify.playbackErrorSkips += 1;
  const currentMatch = getMatchResultForSourceIndex(state.currentIndex);
  const spotifyMatch = getSpotifyMatch(currentMatch);
  const matchName = spotifyMatch
    ? `${spotifyMatch.name} by ${spotifyMatch.artists?.map((artist) => artist.name).join(", ")}`
    : state.plan?.playlist?.[state.currentIndex]?.title || "current track";
  const updatedMatch = markCurrentSpotifyMatchFailed(message);

  if (updatedMatch?.selected && getSpotifyMatchUri(updatedMatch)) {
    setStatus(`Spotify playback failed on ${matchName}: ${message}. Trying an alternate match...`);
    setSpotifyPanelStatus(`Spotify skipped ${matchName}: ${message}. Trying an alternate match...`);
    window.setTimeout(() => {
      startPlayback().catch((error) => {
        setStatus(`Spotify alternate retry failed: ${error.message}`);
      });
    }, 500);
    return;
  }

  if (state.spotify.playbackErrorSkips <= 5 && hasRemainingSpotifyMatch()) {
    setStatus(`Spotify playback failed on ${matchName}: ${message}. Trying the next matched track...`);
    setSpotifyPanelStatus(`Spotify skipped ${matchName}: ${message}. Trying the next matched track...`);
    window.setTimeout(() => {
      nextTrack().catch((error) => {
        setStatus(`Spotify retry failed: ${error.message}`);
      });
    }, 500);
    return;
  }

  setStatus(`Spotify playback failed on ${matchName}: ${message}. No more playable matches in this set.`);
  setSpotifyPanelStatus(`Spotify playback failed on ${matchName}: ${message}. No more playable matches in this set.`);
}

async function playThroughSpotify(sourceIndex) {
  if (!state.plan?.playlist?.length || !hasSpotifySession()) {
    return false;
  }

  let player = null;
  if (state.spotify.sdkReady && !isDesktopApp()) {
    player = await ensureSpotifySdk();
    await player.activateElement?.();
  }

  if (!state.spotify.matchResults.length) {
    await reviewSpotifyMatches();
  }

  const selectedMatches = getSelectedSpotifyMatches();
  if (!selectedMatches.length) {
    throw new Error("No Spotify track matches are selected. Click Review matches, then try Play again.");
  }

  const targetIndex = getNextMatchedSourceIndex(sourceIndex, 1);
  if (targetIndex < 0) {
    throw new Error("The current queue item does not have a playable Spotify match.");
  }

  const playbackOffset = selectedMatches.findIndex((result) => result.sourceIndex === targetIndex);
  if (playbackOffset < 0) {
    return false;
  }

  let deviceId = "";
  let usingSdk = false;

  try {
    if (!isDesktopApp()) {
      player = player || await ensureSpotifySdk();
      await player.activateElement?.();
      deviceId = state.spotify.deviceId;
      usingSdk = true;

      if (!deviceId) {
        throw new Error("Spotify SDK connected, but did not provide a playback device id.");
      }

      await spotifyApi("https://api.spotify.com/v1/me/player", {
        method: "PUT",
        body: JSON.stringify({
          device_ids: [deviceId],
          play: false
        })
      });

      await new Promise((resolve) => window.setTimeout(resolve, 250));
    }
  } catch (error) {
    if (isDesktopApp()) {
      renderPlaybackDevice(null);
      throw new Error(`Musio internal Spotify player failed: ${error.message}`);
    }

    setStatus(`Spotify in-app player unavailable: ${error.message}. Looking for another Spotify device...`);
  }

  if (!deviceId) {
    const device =
      state.spotify.device && Date.now() - state.spotify.deviceCheckedAt < 15000
        ? state.spotify.device
        : await refreshSpotifyDeviceStatus({ quiet: true });
    if (!device?.id) {
      renderPlaybackDevice(null);
      throw new Error("No Spotify playback device found. Open Spotify on this Mac or phone once, then press play again.");
    }
    deviceId = device.id;
    renderPlaybackDevice(device);
  }

  try {
    await spotifyApi(`https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(deviceId)}`, {
      method: "PUT",
      body: JSON.stringify({
        uris: selectedMatches.map((result) => getSpotifyMatchUri(result)),
        offset: { position: playbackOffset }
      })
    });
  } catch (error) {
    if (error.message.includes("Spotify API failed: 404")) {
      renderPlaybackDevice(null);
      throw new Error("Spotify app/device is no longer active. Open Spotify, play/pause once, then try again.");
    }
    throw error;
  }

  state.currentIndex = targetIndex;
  state.spotify.currentSourceIndex = targetIndex;
  state.spotify.usingSdkPlayback = usingSdk;
  state.spotify.usingExternalPlayback = !usingSdk;
  state.isPlaying = true;
  syncPlaybackState();
  renderQueue();
  renderNowPlaying();
  if (!usingSdk) {
    startSpotifyProgressTimer(state.plan.playlist[targetIndex]);
  }
  setStatus(`Playing ${state.plan.playlist[targetIndex].title} with Spotify`);
  return true;
}

async function startPlayback() {
  const currentTrack = state.plan?.playlist?.[state.currentIndex];
  if (!currentTrack) {
    return;
  }

  stopPlayback();

  let spotifyFallbackReason = "";
  try {
    const spotifyStarted = await playThroughSpotify(state.currentIndex);
    if (spotifyStarted) {
      return;
    }
  } catch (error) {
    spotifyFallbackReason = error.message;
    setStatus(`Spotify playback unavailable: ${error.message}`);
    if (hasSpotifySession() && isDesktopApp()) {
      return;
    }
  }

  if (currentTrack.previewUrl) {
    state.audio.src = currentTrack.previewUrl;
    state.audio.currentTime = 0;
    state.audio
      .play()
      .then(() => {
        state.isPlaying = true;
        syncPlaybackState();
        renderQueue();
        setStatus(
          spotifyFallbackReason
            ? `Playing 30-second preview. Spotify full playback did not start: ${spotifyFallbackReason}`
            : `Playing 30-second preview: ${currentTrack.title}`
        );
      })
      .catch((error) => {
        setStatus(`Playback failed: ${error.message}`);
      });
    return;
  }

  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) {
    setStatus("This browser does not support Web Audio.");
    return;
  }

  const audioContext = new AudioContextCtor();
  const gain = audioContext.createGain();
  gain.gain.value = 0.05;
  gain.connect(audioContext.destination);

  let noteIndex = 0;
  const notes = currentTrack.noteSet.map(buildFrequency);
  const stepDuration = Math.max(0.3, 60 / currentTrack.bpm);
  let elapsed = 0;

  const timer = setInterval(() => {
    const oscillator = audioContext.createOscillator();
    oscillator.type = noteIndex % 3 === 0 ? "sine" : "triangle";
    oscillator.frequency.value = notes[noteIndex % notes.length];
    oscillator.connect(gain);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + stepDuration * 0.9);
    noteIndex += 1;
    elapsed += stepDuration;

    const ratio = Math.min(1, elapsed / currentTrack.durationSec);
    elements.progressFill.style.width = `${ratio * 100}%`;
    elements.progressTime.textContent = `${formatTime(elapsed)} / ${formatTime(currentTrack.durationSec)}`;

    if (elapsed >= currentTrack.durationSec) {
      nextTrack();
    }
  }, stepDuration * 1000);

  state.synth = {
    timer,
    cleanup: () => {
      audioContext.close().catch(() => {});
    }
  };

  state.isPlaying = true;
  syncPlaybackState();
  renderQueue();
  setStatus(`Playing ${currentTrack.title}`);
}

async function togglePlayback() {
  if (!state.plan?.playlist?.length) {
    setStatus("Generate a DJ set first.");
    return;
  }

  if (state.isPlaying) {
    if (state.spotify.player && state.spotify.usingSdkPlayback) {
      await state.spotify.player.pause().catch(() => {});
      state.isPlaying = false;
      syncPlaybackState();
      renderQueue();
      setStatus("Paused");
      return;
    }

    if (state.spotify.usingExternalPlayback) {
      await spotifyApi("https://api.spotify.com/v1/me/player/pause", {
        method: "PUT"
      }).catch(() => {});
      state.spotify.usingExternalPlayback = false;
      if (state.spotify.progressTimer) {
        clearInterval(state.spotify.progressTimer);
        state.spotify.progressTimer = null;
      }
      state.isPlaying = false;
      syncPlaybackState();
      renderQueue();
      setStatus("Paused");
      return;
    }

    stopPlayback();
    setStatus("Paused");
    return;
  }

  state.spotify.playbackErrorSkips = 0;
  await startPlayback();
}

async function prevTrack() {
  if (!state.plan?.playlist?.length) return;

  if (
    (state.spotify.player && state.spotify.usingSdkPlayback) ||
    state.spotify.usingExternalPlayback
  ) {
    const targetIndex = getNextMatchedSourceIndex(state.currentIndex - 1, -1);
    if (targetIndex >= 0) {
      state.currentIndex = targetIndex;
      await startPlayback();
      return;
    }
  }

  state.currentIndex = (state.currentIndex - 1 + state.plan.playlist.length) % state.plan.playlist.length;
  if (state.isPlaying) {
    await startPlayback();
    return;
  }

  renderPlan();
}

async function nextTrack() {
  if (!state.plan?.playlist?.length) return;

  if (
    (state.spotify.player && state.spotify.usingSdkPlayback) ||
    state.spotify.usingExternalPlayback
  ) {
    const targetIndex = getNextMatchedSourceIndex(state.currentIndex + 1, 1);
    if (targetIndex >= 0) {
      state.currentIndex = targetIndex;
      await startPlayback();
      return;
    }
  }

  state.currentIndex = (state.currentIndex + 1) % state.plan.playlist.length;
  if (state.isPlaying) {
    await startPlayback();
    return;
  }

  renderPlan();
}

function speakIntro() {
  if (!state.speechEnabled || !state.plan?.intro) {
    setStatus("Speech is not available, or no intro has been generated yet.");
    return;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(state.plan.intro);
  utterance.lang = "en-US";
  utterance.rate = 1;
  window.speechSynthesis.speak(utterance);
  setStatus("Reading the intro aloud");
}

function bindAudioEvents() {
  state.audio.addEventListener("timeupdate", () => {
    const duration = Number.isFinite(state.audio.duration)
      ? state.audio.duration
      : state.plan?.playlist?.[state.currentIndex]?.durationSec || 0;
    const currentTime = state.audio.currentTime || 0;
    const ratio = duration > 0 ? Math.min(1, currentTime / duration) : 0;
    elements.progressFill.style.width = `${ratio * 100}%`;
    elements.progressTime.textContent = `${formatTime(currentTime)} / ${formatTime(duration)}`;
  });

  state.audio.addEventListener("ended", () => {
    nextTrack();
  });

  state.audio.addEventListener("pause", () => {
    if (!state.audio.ended && state.audio.currentTime > 0) {
      state.isPlaying = false;
      syncPlaybackState();
      renderQueue();
      setStatus("Paused");
    }
  });
}

async function generatePlan() {
  const prompt = elements.promptInput.value.trim();
  if (!prompt) {
    setStatus("Enter a mood prompt first.");
    return;
  }

  setStatus("Musio is arranging the next broadcast...");
  elements.planButton.disabled = true;

  try {
    const response = await fetch("/api/dj/plan", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ prompt })
    });

    if (!response.ok) {
      const payload = await response.json();
      throw new Error(payload.detail || payload.error || "Failed to generate plan");
    }

    state.plan = await response.json();
    state.currentIndex = 0;
    resetSpotifyReview("A new DJ set is ready. Review Spotify matches before saving.");
    stopPlayback();
    renderPlan();
    renderSpotify();
    await loadBootstrap({ preservePrompt: true });
    setStatus("A new DJ set is ready");
  } catch (error) {
    setStatus(`Generation failed: ${error.message}`);
  } finally {
    elements.planButton.disabled = false;
  }
}

async function updateMockOura(profileId) {
  setStatus("Switching body state...");
  try {
    const response = await fetch("/api/oura/mock", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ profileId })
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.detail || payload.error || "Failed to update Oura state");
    }
    state.oura = payload.oura;
    renderOura();
    setStatus("Mock Oura state updated. The next set will use it.");
  } catch (error) {
    setStatus(`Oura update failed: ${error.message}`);
  }
}

async function sha256(plain) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return window.crypto.subtle.digest("SHA-256", data);
}

function base64UrlEncode(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function randomString(length = 64) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from(window.crypto.getRandomValues(new Uint8Array(length)))
    .map((value) => chars[value % chars.length])
    .join("");
}

async function spotifyApi(url, options = {}) {
  const token = state.spotify.accessToken;
  if (!token || state.spotify.expiresAt <= Date.now()) {
    throw new Error("Spotify session expired. Please connect again.");
  }

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    const payload = await response.text();
    throw new Error(`Spotify API failed: ${response.status} ${payload}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

async function fetchSpotifyProfile() {
  state.spotify.profile = await spotifyApi("https://api.spotify.com/v1/me");
  renderSpotify();
}

async function checkSpotifyPlayback() {
  if (!state.spotify.accessToken || state.spotify.expiresAt <= Date.now()) {
    setStatus("Spotify is not connected in this app window. Connect Spotify first.");
    setSpotifyPanelStatus("Spotify is not connected in this app window. Connect Spotify first.");
    return;
  }

  setStatus("Checking Spotify playback...");
  setSpotifyPanelStatus("Checking whether Musio can become its own Spotify player...");
  elements.spotifyCheckButton.disabled = true;

  try {
    if (!state.spotify.profile) {
      await fetchSpotifyProfile();
    }

    const product = state.spotify.profile?.product || "unknown plan";

    if (!isDesktopApp()) {
      try {
        await ensureSpotifySdk();
        const readyMessage = `Spotify connected (${product}). Musio browser player is ready.`;
        setStatus(readyMessage);
        setSpotifyPanelStatus(readyMessage);
        return;
      } catch {
        // Browser mode can still fall through to another Spotify Connect device.
      }
    }

    const device = await refreshSpotifyDeviceStatus({ quiet: true });

    if (!device) {
      renderPlaybackDevice(null);
      const noDeviceMessage =
        `Spotify connected (${product}), but no Spotify app/device is visible. Open Spotify on this Mac or phone, play/pause once, then try again.`;
      setStatus(noDeviceMessage);
      setSpotifyPanelStatus(noDeviceMessage);
      return;
    }

    renderPlaybackDevice(device);
    const deviceMessage = `Spotify connected (${product}). Spotify app/device ready: ${device.name} (${device.type}).`;
    setStatus(deviceMessage);
    setSpotifyPanelStatus(deviceMessage);
  } catch (error) {
    const failedMessage = `Spotify playback check failed: ${error.message}`;
    setStatus(failedMessage);
    setSpotifyPanelStatus(failedMessage);
  } finally {
    elements.spotifyCheckButton.disabled = false;
  }
}

async function handleSpotifyCallback() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const error = params.get("error");
  const returnedState = params.get("state");

  if (error) {
    setStatus(`Spotify authorization failed: ${error}`);
    window.history.replaceState({}, "", getRedirectUri());
    return;
  }

  if (!code) {
    return;
  }

  const expectedState = localStorage.getItem(SPOTIFY_STORAGE_KEYS.authState);
  const codeVerifier = localStorage.getItem(SPOTIFY_STORAGE_KEYS.codeVerifier);

  if (!expectedState || returnedState !== expectedState || !codeVerifier || !state.spotify.clientId) {
    setStatus("Spotify authorization could not be validated.");
    window.history.replaceState({}, "", getRedirectUri());
    return;
  }

  try {
    const body = new URLSearchParams({
      client_id: state.spotify.clientId,
      grant_type: "authorization_code",
      code,
      redirect_uri: getRedirectUri(),
      code_verifier: codeVerifier
    });

    const response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error_description || payload.error || "Spotify token exchange failed");
    }

    state.spotify.accessToken = payload.access_token;
    state.spotify.expiresAt = Date.now() + Number(payload.expires_in || 3600) * 1000;
    syncSpotifyStorage();
    await fetchSpotifyProfile();
    ensureSpotifySdk().catch(() => {});
    setStatus("Spotify connected");
  } catch (exchangeError) {
    setStatus(`Spotify auth failed: ${exchangeError.message}`);
  } finally {
    localStorage.removeItem(SPOTIFY_STORAGE_KEYS.codeVerifier);
    localStorage.removeItem(SPOTIFY_STORAGE_KEYS.authState);
    window.history.replaceState({}, "", getRedirectUri());
  }
}

async function startSpotifyAuth() {
  const clientId = elements.spotifyClientIdInput.value.trim();
  if (!clientId) {
    setStatus("Add a Spotify Client ID first.");
    return;
  }

  state.spotify.clientId = clientId;
  syncSpotifyStorage();
  renderSpotify();

  if (isDesktopApp()) {
    await startDesktopSpotifyAuth(clientId);
    return;
  }

  const codeVerifier = randomString(64);
  const codeChallenge = base64UrlEncode(await sha256(codeVerifier));
  const authState = randomString(24);

  localStorage.setItem(SPOTIFY_STORAGE_KEYS.codeVerifier, codeVerifier);
  localStorage.setItem(SPOTIFY_STORAGE_KEYS.authState, authState);

  const authUrl = new URL("https://accounts.spotify.com/authorize");
  authUrl.search = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: getRedirectUri(),
    code_challenge_method: "S256",
    code_challenge: codeChallenge,
    state: authState,
    scope: "streaming user-read-email user-read-private user-read-playback-state user-modify-playback-state playlist-modify-private",
    show_dialog: "true"
  }).toString();

  window.location.href = authUrl.toString();
}

async function startDesktopSpotifyAuth(clientId) {
  setStatus("Opening Spotify authorization in your browser...");

  try {
    const response = await fetch("/api/spotify/auth/start", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ clientId })
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.detail || payload.error || "Failed to start Spotify auth");
    }

    window.open(payload.authUrl, "_blank", "noopener,noreferrer");
    setStatus("Finish Spotify authorization in your browser, then return to Musio.");

    for (let attempt = 0; attempt < 120; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 1000));
      const sessionResponse = await fetch("/api/spotify/session");
      const sessionPayload = await sessionResponse.json();

      if (sessionPayload.error) {
        throw new Error(sessionPayload.error);
      }

      if (sessionPayload.session?.accessToken) {
        state.spotify.clientId = sessionPayload.session.clientId || clientId;
        state.spotify.accessToken = sessionPayload.session.accessToken;
        state.spotify.expiresAt = Number(sessionPayload.session.expiresAt || 0);
        state.spotify.player = null;
        state.spotify.deviceId = "";
        state.spotify.sdkReady = false;
        state.spotify.sdkLoading = false;
        spotifySdkPromise = null;
        syncSpotifyStorage();
        await fetchSpotifyProfile();
        renderSpotify();
        renderPlaybackDevice(null);
        startSpotifyDevicePolling();
        setStatus("Spotify connected");
        return;
      }
    }

    throw new Error("Spotify authorization timed out. Try Connect Spotify again.");
  } catch (error) {
    setStatus(`Spotify auth failed: ${error.message}`);
  }
}

function disconnectSpotify() {
  if (state.spotify.player) {
    state.spotify.player.disconnect();
  }

  state.spotify.accessToken = "";
  state.spotify.expiresAt = 0;
  state.spotify.profile = null;
  state.spotify.player = null;
  state.spotify.deviceId = "";
  state.spotify.sdkReady = false;
  state.spotify.sdkLoading = false;
  state.spotify.usingSdkPlayback = false;
  state.spotify.usingExternalPlayback = false;
  state.spotify.device = null;
  state.spotify.deviceCheckedAt = 0;
  stopSpotifyDevicePolling();
  if (state.spotify.progressTimer) {
    clearInterval(state.spotify.progressTimer);
    state.spotify.progressTimer = null;
  }
  state.spotify.currentSourceIndex = -1;
  renderPlaybackDevice(null);
  spotifySdkPromise = null;
  resetSpotifyReview();
  syncSpotifyStorage();
  renderSpotify();
  setStatus("Spotify disconnected");
}

async function openSpotifyApp() {
  try {
    const response = await fetch("/api/system/open-spotify", { method: "POST" });
    if (!response.ok) {
      throw new Error("Could not open Spotify in the background.");
    }
    setStatus("Opening Spotify in the background. If needed, play/pause once in Spotify.");
  } catch {
    window.open("spotify:", "_blank", "noopener,noreferrer");
    setStatus("Opening Spotify. Play/pause once there, then return to Musio.");
  }
  startSpotifyDevicePolling();
}

async function searchSpotifyTrack(track) {
  const searchUrl = new URL("https://api.spotify.com/v1/search");
  searchUrl.searchParams.set("type", "track");
  searchUrl.searchParams.set("limit", "5");
  searchUrl.searchParams.set("market", "from_token");
  searchUrl.searchParams.set("q", `track:${track.title} artist:${track.artist}`);
  let payload = await spotifyApi(searchUrl.toString());
  let items = payload?.tracks?.items || [];
  let item = items.find((candidate) => candidate.is_playable !== false) || items[0];

  if (!item) {
    searchUrl.searchParams.set("q", `${track.title} ${track.artist}`);
    payload = await spotifyApi(searchUrl.toString());
    items = payload?.tracks?.items || [];
    item = items.find((candidate) => candidate.is_playable !== false) || items[0];
  }

  return item || null;
}

async function searchSpotifyTrackCandidates(track) {
  const searchUrl = new URL("https://api.spotify.com/v1/search");
  searchUrl.searchParams.set("type", "track");
  searchUrl.searchParams.set("limit", "10");
  searchUrl.searchParams.set("market", "from_token");
  searchUrl.searchParams.set("q", `track:${track.title} artist:${track.artist}`);
  let payload = await spotifyApi(searchUrl.toString());
  let items = payload?.tracks?.items || [];

  if (!items.length) {
    searchUrl.searchParams.set("q", `${track.title} ${track.artist}`);
    payload = await spotifyApi(searchUrl.toString());
    items = payload?.tracks?.items || [];
  }

  const seen = new Set();
  return items
    .filter((item) => item?.uri && !seen.has(item.uri) && seen.add(item.uri))
    .sort((a, b) => {
      const playableDelta = Number(b.is_playable !== false) - Number(a.is_playable !== false);
      if (playableDelta) {
        return playableDelta;
      }
      return scoreSpotifyMatch(track, b).score - scoreSpotifyMatch(track, a).score;
    });
}

async function reviewSpotifyMatches() {
  if (!state.plan?.playlist?.length) {
    setStatus("Generate a DJ set first.");
    return;
  }

  if (!state.spotify.accessToken || state.spotify.expiresAt <= Date.now()) {
    setStatus("Connect Spotify before reviewing matches.");
    return;
  }

  elements.spotifyReviewButton.disabled = true;
  resetSpotifyReview("Reviewing Spotify matches...");
  renderSpotify();
  setStatus("Reviewing Spotify matches...");

  try {
    const results = [];
    for (const track of state.plan.playlist) {
      const candidates = await searchSpotifyTrackCandidates(track);
      const match = candidates[0] || null;
      const confidence = match ? scoreSpotifyMatch(track, match) : null;
      results.push({
        sourceIndex: results.length,
        sourceTrack: track,
        match,
        activeMatch: match,
        candidates,
        confidence,
        selected: Boolean(match && match.is_playable !== false),
        playbackFailed: false,
        playbackError: "",
        failedUris: []
      });
    }

    state.spotify.matchResults = results;
    updateSpotifyReviewSummary();
    renderSpotify();
    setStatus("Spotify review is ready");
  } catch (reviewError) {
    resetSpotifyReview("Review failed. Try again after reconnecting Spotify.");
    renderSpotify();
    setStatus(`Spotify review failed: ${reviewError.message}`);
  } finally {
    elements.spotifyReviewButton.disabled = false;
  }
}

async function createSpotifyPlaylistFromPlan() {
  if (!state.plan?.playlist?.length) {
    setStatus("Generate a DJ set first.");
    return;
  }

  if (!state.spotify.accessToken || state.spotify.expiresAt <= Date.now()) {
    setStatus("Connect Spotify before saving a playlist.");
    return;
  }

  elements.spotifyPlaylistButton.disabled = true;
  elements.spotifyPlaylistLink.classList.add("hidden");
  setStatus("Preparing Spotify playlist...");

  try {
    if (!state.spotify.profile) {
      await fetchSpotifyProfile();
    }

    if (!state.spotify.matchResults.length) {
      await reviewSpotifyMatches();
    }

    const selectedMatches = state.spotify.matchResults
      .filter((result) => result.selected && getSpotifyMatchUri(result))
      .map((result) => getSpotifyMatch(result));

    if (selectedMatches.length === 0) {
      throw new Error("No confirmed Spotify matches are selected for save.");
    }

    const playlistName = `Musio — ${state.plan.prompt}`.slice(0, 90);
    const playlist = await spotifyApi("https://api.spotify.com/v1/me/playlists", {
      method: "POST",
      body: JSON.stringify({
        name: playlistName,
        public: false,
        description:
          `AI DJ set generated by Musio. Prompt: ${state.plan.prompt}. ` +
          `Body state: ${state.plan.bodyState?.label || "Unknown"}.`
      })
    });

    await spotifyApi(`https://api.spotify.com/v1/playlists/${playlist.id}/items`, {
      method: "POST",
      body: JSON.stringify({
        uris: selectedMatches.map((match) => match.uri)
      })
    });

    state.spotify.playlistUrl = playlist.external_urls?.spotify || "";
    updateSpotifyReviewSummary();
    renderSpotify();
    setStatus(`Saved ${selectedMatches.length} tracks to Spotify`);
  } catch (playlistError) {
    setStatus(`Spotify playlist creation failed: ${playlistError.message}`);
  } finally {
    elements.spotifyPlaylistButton.disabled = false;
  }
}

async function loadBootstrap(options = {}) {
  const response = await fetch("/api/bootstrap");
  const payload = await response.json();

  state.quickPrompts = payload.quickPrompts;
  state.history = payload.history;
  state.oura = payload.oura;

  renderQuickPrompts();
  renderHistory();
  renderOura();

  if (!options.preservePrompt && !elements.promptInput.value) {
    elements.promptInput.value = payload.quickPrompts[0];
  }

  const legacyCurrentPlan =
    containsHanText(payload.currentPlan?.prompt) || containsHanText(payload.currentPlan?.intro);

  if (!state.plan && payload.currentPlan && !legacyCurrentPlan) {
    state.plan = payload.currentPlan;
    renderPlan();
  }
}

elements.randomPromptButton.addEventListener("click", randomizePrompt);
elements.planButton.addEventListener("click", generatePlan);
elements.playButton.addEventListener("click", togglePlayback);
elements.prevButton.addEventListener("click", prevTrack);
elements.nextButton.addEventListener("click", nextTrack);
elements.speakButton.addEventListener("click", speakIntro);
elements.openSpotifyButton.addEventListener("click", openSpotifyApp);
elements.spotifyAuthButton.addEventListener("click", startSpotifyAuth);
elements.spotifyLogoutButton.addEventListener("click", disconnectSpotify);
elements.spotifyReviewButton.addEventListener("click", reviewSpotifyMatches);
elements.spotifyCheckButton.addEventListener("click", checkSpotifyPlayback);
elements.spotifyPlaylistButton.addEventListener("click", createSpotifyPlaylistFromPlan);
elements.spotifyClientIdInput.addEventListener("change", () => {
  state.spotify.clientId = elements.spotifyClientIdInput.value.trim();
  syncSpotifyStorage();
  renderSpotify();
});

bindAudioEvents();
renderSpotify();
syncPlaybackState();

Promise.resolve()
  .then(handleSpotifyCallback)
  .then(async () => {
    if (state.spotify.accessToken && state.spotify.expiresAt > Date.now()) {
      try {
        await fetchSpotifyProfile();
        if (isDesktopApp()) {
          startSpotifyDevicePolling();
        } else {
          ensureSpotifySdk().catch(() => {});
        }
      } catch (error) {
        setStatus(`Spotify session needs attention: ${error.message}`);
      }
    }
  })
  .then(() => loadBootstrap())
  .catch((error) => {
    setStatus(`Initialization failed: ${error.message}`);
  });
