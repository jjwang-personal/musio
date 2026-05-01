import http from "node:http";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { quickPrompts, tastePresets, trackCatalog } from "./lib/catalog.js";
import { createDjPlan } from "./lib/dj.js";
import {
  getMockOuraProfile,
  mockOuraProfiles,
  resolveOuraState,
  toBodyState
} from "./lib/oura.js";
import { readState, updateState } from "./lib/state.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");
const defaultPort = Number(process.env.PORT || 3000);
const spotifyDesktopAuth = {
  state: "",
  verifier: "",
  clientId: "",
  session: null,
  error: ""
};

async function loadLocalEnv() {
  try {
    const envPath = process.env.MUSIO_ENV_PATH || path.join(__dirname, ".env");
    const raw = await readFile(envPath, "utf8");
    raw.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
        return;
      }

      const [key, ...valueParts] = trimmed.split("=");
      if (process.env[key]) {
        return;
      }

      process.env[key] = valueParts.join("=").trim().replace(/^["']|["']$/g, "");
    });
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn("[musio] Could not read .env:", error.message);
    }
  }
}

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon"
};

function json(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload, null, 2));
}

async function parseBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  if (chunks.length === 0) {
    return {};
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function randomString(length = 64) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes)
    .map((value) => chars[value % chars.length])
    .join("");
}

async function sha256(plain) {
  const data = new TextEncoder().encode(plain);
  return crypto.subtle.digest("SHA-256", data);
}

function base64UrlEncode(buffer) {
  return Buffer.from(buffer)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function html(response, statusCode, body) {
  response.writeHead(statusCode, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(body);
}

function openSpotifyInBackground() {
  return new Promise((resolve, reject) => {
    if (process.platform !== "darwin") {
      reject(new Error("Background Spotify launch is only supported on macOS."));
      return;
    }

    execFile("open", ["-gj", "-a", "Spotify"], (error) => {
      if (error) {
        reject(error);
        return;
      }

      setTimeout(() => {
        execFile("osascript", [
          "-e",
          'tell application "System Events" to set visible of process "Spotify" to false'
        ], () => {
          resolve();
        });
      }, 1200);
    });
  });
}

async function serveStatic(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.join(publicDir, pathname);

  if (!filePath.startsWith(publicDir)) {
    json(response, 403, { error: "Forbidden" });
    return;
  }

  try {
    const file = await readFile(filePath);
    const extension = path.extname(filePath);
    response.writeHead(200, {
      "Content-Type": mimeTypes[extension] || "application/octet-stream"
    });
    response.end(file);
  } catch (error) {
    if (error.code === "ENOENT") {
      json(response, 404, { error: "Not found" });
      return;
    }
    json(response, 500, { error: "Failed to read static file" });
  }
}

async function handleApi(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (request.method === "GET" && url.pathname === "/api/health") {
    json(response, 200, {
      ok: true,
      app: "musio",
      timestamp: new Date().toISOString()
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/runtime") {
    let electronRuntime = null;
    try {
      electronRuntime = process.env.MUSIO_ELECTRON_RUNTIME
        ? JSON.parse(process.env.MUSIO_ELECTRON_RUNTIME)
        : null;
    } catch {
      electronRuntime = { parseError: true };
    }

    json(response, 200, {
      ok: true,
      desktop: Boolean(electronRuntime),
      electronRuntime,
      node: process.version,
      platform: process.platform,
      arch: process.arch
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/system/open-spotify") {
    try {
      await openSpotifyInBackground();
      json(response, 200, { ok: true, mode: "background" });
    } catch (error) {
      json(response, 500, {
        error: "Failed to open Spotify",
        detail: error.message
      });
    }
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/bootstrap") {
    const state = await readState();
    const ouraState = await resolveOuraState(state.oura);
    json(response, 200, {
      quickPrompts,
      tastePresets,
      currentPlan: state.currentPlan,
      prefs: state.prefs,
      oura: ouraState,
      history: state.history.slice(-6).reverse(),
      catalogSize: trackCatalog.length
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/spotify/auth/start") {
    try {
      const body = await parseBody(request);
      const clientId = String(body.clientId || "").trim();
      if (!clientId) {
        json(response, 400, { error: "Missing Spotify Client ID" });
        return;
      }

      const verifier = randomString(64);
      const authState = randomString(24);
      const redirectUri = `http://${request.headers.host}/api/spotify/callback`;
      const challenge = base64UrlEncode(await sha256(verifier));
      const authUrl = new URL("https://accounts.spotify.com/authorize");
      authUrl.search = new URLSearchParams({
        response_type: "code",
        client_id: clientId,
        redirect_uri: redirectUri,
        code_challenge_method: "S256",
        code_challenge: challenge,
        state: authState,
        scope: "streaming user-read-email user-read-private user-read-playback-state user-modify-playback-state playlist-modify-private",
        show_dialog: "true"
      }).toString();

      spotifyDesktopAuth.state = authState;
      spotifyDesktopAuth.verifier = verifier;
      spotifyDesktopAuth.clientId = clientId;
      spotifyDesktopAuth.session = null;
      spotifyDesktopAuth.error = "";

      json(response, 200, {
        authUrl: authUrl.toString(),
        redirectUri
      });
    } catch (error) {
      json(response, 500, {
        error: "Failed to start Spotify auth",
        detail: error.message
      });
    }
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/spotify/session") {
    json(response, 200, {
      ok: true,
      session: spotifyDesktopAuth.session,
      error: spotifyDesktopAuth.error
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/spotify/callback") {
    const error = url.searchParams.get("error");
    const code = url.searchParams.get("code");
    const returnedState = url.searchParams.get("state");

    if (error) {
      spotifyDesktopAuth.error = error;
      html(response, 400, "<h1>Spotify authorization failed</h1><p>You can close this tab and return to Musio.</p>");
      return;
    }

    if (!code || returnedState !== spotifyDesktopAuth.state || !spotifyDesktopAuth.verifier) {
      spotifyDesktopAuth.error = "Spotify authorization could not be validated.";
      html(response, 400, "<h1>Spotify authorization could not be validated</h1><p>You can close this tab and try connecting again from Musio.</p>");
      return;
    }

    try {
      const redirectUri = `http://${request.headers.host}/api/spotify/callback`;
      const body = new URLSearchParams({
        client_id: spotifyDesktopAuth.clientId,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        code_verifier: spotifyDesktopAuth.verifier
      });

      const tokenResponse = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body
      });
      const payload = await tokenResponse.json();
      if (!tokenResponse.ok) {
        throw new Error(payload.error_description || payload.error || "Spotify token exchange failed");
      }

      spotifyDesktopAuth.session = {
        clientId: spotifyDesktopAuth.clientId,
        accessToken: payload.access_token,
        expiresAt: Date.now() + Number(payload.expires_in || 3600) * 1000,
        scope: payload.scope || ""
      };
      spotifyDesktopAuth.error = "";
      html(response, 200, "<h1>Spotify connected</h1><p>You can close this tab and return to Musio.</p>");
    } catch (callbackError) {
      spotifyDesktopAuth.error = callbackError.message;
      html(response, 500, "<h1>Spotify connection failed</h1><p>You can close this tab and try connecting again from Musio.</p>");
    }
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/oura/refresh") {
    try {
      const state = await readState();
      const ouraState = await resolveOuraState(state.oura);
      json(response, 200, {
        ok: true,
        oura: ouraState
      });
    } catch (error) {
      json(response, 500, {
        error: "Failed to refresh Oura state",
        detail: error.message
      });
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/oura/mock") {
    try {
      const body = await parseBody(request);
      const profile = getMockOuraProfile(String(body.profileId || ""));
      const nextState = await updateState((draft) => ({
        ...draft,
        oura: {
          mode: "mock",
          selectedProfileId: profile.id
        }
      }));

      json(response, 200, {
        ok: true,
        oura: {
          ...nextState.oura,
          availableProfiles: mockOuraProfiles,
          bodyState: toBodyState(profile)
        }
      });
    } catch (error) {
      json(response, 500, {
        error: "Failed to update mock Oura state",
        detail: error.message
      });
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/dj/plan") {
    try {
      const body = await parseBody(request);
      const prompt = String(body.prompt || "");
      const state = await readState();
      const ouraState = await resolveOuraState(state.oura);
      const plan = await createDjPlan(prompt, state.prefs, ouraState.bodyState);

      await updateState((draft) => {
        const historyEntry = {
          id: plan.id,
          prompt: plan.prompt,
          intro: plan.intro,
          generatedAt: plan.generatedAt,
          source: plan.source,
          tags: plan.tags,
          ouraProfileId: plan.bodyState?.profileId || null,
          trackIds: plan.playlist.map((track) => track.id)
        };

        return {
          ...draft,
          currentPlan: plan,
          history: [...draft.history, historyEntry].slice(-20)
        };
      });

      json(response, 200, plan);
    } catch (error) {
      json(response, 500, {
        error: "Failed to generate DJ plan",
        detail: error.message
      });
    }
    return;
  }

  json(response, 404, { error: "Unknown API route" });
}

function createServer() {
  return http.createServer(async (request, response) => {
    try {
      if (!request.url) {
        json(response, 400, { error: "Missing request URL" });
        return;
      }

      if (request.url.startsWith("/api/")) {
        await handleApi(request, response);
        return;
      }

      await serveStatic(request, response);
    } catch (error) {
      json(response, 500, { error: "Unhandled server error", detail: error.message });
    }
  });
}

export async function startMusioServer(options = {}) {
  const port = Number(options.port || defaultPort);
  await loadLocalEnv();

  const server = createServer();

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, () => {
      server.off("error", reject);
      const ouraMode = process.env.OURA_PERSONAL_ACCESS_TOKEN ? "live Oura token detected" : "mock Oura";
      console.log(`Musio is running on http://localhost:${port} (${ouraMode})`);
      resolve(server);
    });
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  await startMusioServer();
}
