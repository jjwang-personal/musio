import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const dataDir = process.env.MUSIO_DATA_DIR || path.join(process.cwd(), "data");
const statePath = path.join(dataDir, "state.json");

const defaultState = {
  prefs: {
    djName: "Musio",
    language: "en-US",
    tasteNotes: "Leaning atmospheric, never too harsh, with transitions that feel like a real radio host."
  },
  oura: {
    mode: "mock",
    selectedProfileId: "steady-focus"
  },
  history: [],
  currentPlan: null
};

export async function readState() {
  try {
    const raw = await readFile(statePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === "ENOENT") {
      return structuredClone(defaultState);
    }
    throw error;
  }
}

export async function writeState(nextState) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(statePath, JSON.stringify(nextState, null, 2), "utf8");
}

export async function updateState(mutator) {
  const state = await readState();
  const nextState = await mutator(state);
  await writeState(nextState);
  return nextState;
}
