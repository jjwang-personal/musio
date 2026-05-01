const { app, BrowserWindow, shell } = require("electron");
const { execFile } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const port = Number(process.env.MUSIO_DESKTOP_PORT || 3060);
const appUrl = `http://127.0.0.1:${port}`;

let mainWindow = null;
let server = null;

app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

function getAppRoot() {
  if (!app.isPackaged) {
    return path.resolve(__dirname, "..");
  }

  return process.resourcesPath;
}

function getServerPath() {
  if (!app.isPackaged) {
    return path.resolve(__dirname, "..", "server.js");
  }

  return path.join(process.resourcesPath, "app.asar", "server.js");
}

async function startServer() {
  if (server) {
    return;
  }

  const appRoot = getAppRoot();
  const projectEnvPath = path.join(appRoot, ".env");
  const userEnvPath = path.join(app.getPath("userData"), ".env");
  const envPath = fs.existsSync(userEnvPath) ? userEnvPath : projectEnvPath;

  process.env.PORT = String(port);
  process.env.MUSIO_DATA_DIR = path.join(app.getPath("userData"), "data");

  if (fs.existsSync(envPath)) {
    process.env.MUSIO_ENV_PATH = envPath;
  }

  const serverModule = await import(pathToFileURL(getServerPath()).href);
  server = await serverModule.startMusioServer({ port });
}

async function waitForServer(retries = 60) {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      const response = await fetch(`${appUrl}/api/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // The local server usually needs a moment to boot before the window loads.
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Musio server did not start at ${appUrl}`);
}

function openSpotifyApp() {
  execFile("open", ["-gj", "-a", "Spotify"], (error) => {
    if (error) {
      shell.openExternal("spotify:").catch((fallbackError) => {
        console.warn("[musio] Could not open Spotify app:", fallbackError.message);
      });
    }

    setTimeout(() => {
      execFile("osascript", [
        "-e",
        'tell application "System Events" to set visible of process "Spotify" to false'
      ], (hideError) => {
        if (hideError) {
          console.warn("[musio] Could not hide Spotify app:", hideError.message);
        }
        mainWindow?.focus();
      });
    }, 1200);
  });
}

async function createWindow() {
  app.setName("Musio");
  await startServer();
  await waitForServer();

  mainWindow = new BrowserWindow({
    width: 440,
    height: 820,
    minWidth: 390,
    minHeight: 720,
    title: "Musio",
    backgroundColor: "#06070d",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  await mainWindow.loadURL(appUrl);
  openSpotifyApp();

  if (process.env.MUSIO_OPEN_DEVTOOLS === "1") {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }
}

app.whenReady().then(createWindow).catch((error) => {
  console.error("[musio] Failed to start desktop app:", error);
  app.quit();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow().catch((error) => {
      console.error("[musio] Failed to reopen desktop app:", error);
    });
  }
});

app.on("before-quit", () => {
  if (server) {
    server.close();
    server = null;
  }
});
