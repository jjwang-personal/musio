# Musio

Musio is a body-aware AI DJ prototype. It combines a custom player UI, Oura-driven body state, DJ copy, and Spotify/preview playback experiments.

## Web Mode

```bash
node server.js
```

Open [http://localhost:3000](http://localhost:3000).

If your terminal does not have `node`, use:

```bash
/Applications/Codex.app/Contents/Resources/node server.js
```

## Desktop Mode

The Electron wrapper lives in [electron/main.cjs](/Users/jingjuewang/repo/musio/electron/main.cjs).

Install dependencies once:

```bash
npm install
```

Then run the desktop app:

```bash
npm run desktop
```

Desktop mode starts Musio on `http://localhost:3060` internally and opens it in a native app window.

## Local Secrets

Create `.env` for local-only secrets:

```env
OURA_PERSONAL_ACCESS_TOKEN=your_oura_token
```

`.env` is ignored by git.

## Optional AI Copy

```bash
OPENAI_API_KEY=your_key node server.js
```

Optional variables:

- `OPENAI_MODEL`
- `OPENAI_BASE_URL`
- `PORT`
- `MUSIO_DESKTOP_PORT`
- `MUSIO_NODE_PATH`

## What This MVP Includes

- `server.js`: native Node HTTP server
- `electron/main.cjs`: desktop app wrapper
- `public/`: custom player UI
- `lib/dj.js`: AI DJ planning logic
- `lib/music-source.js`: Apple iTunes preview lookup
- `lib/oura.js`: live/mock Oura state and decision trace
- `lib/state.js`: JSON state persistence
- `lib/catalog.js`: local demo crate and prompt presets
