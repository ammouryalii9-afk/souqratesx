import { create } from "zustand";

export type GamePhase =
  | "IDLE"
  | "CASTING"
  | "WAITING"
  | "BITING"
  | "REELING"
  | "CATCH"
  | "MISS";

export type FishRarity = "common" | "rare" | "epic" | "legendary";

export interface FishType {
  id: string;
  name: string;
  rarity: FishRarity;
  skp: number;
  color: string;
  size: number;
  emoji: string;
}

export const FISH_TYPES: FishType[] = [
  { id: "sardine",   name: "Sardine",       rarity: "common",    skp: 50,    color: "#78b4e0", size: 0.4, emoji: "🐟" },
  { id: "carp",      name: "Golden Carp",   rarity: "common",    skp: 80,    color: "#f0c040", size: 0.55, emoji: "🐠" },
  { id: "bass",      name: "Sea Bass",      rarity: "rare",      skp: 200,   color: "#4a9b7f", size: 0.7, emoji: "🐡" },
  { id: "tuna",      name: "Bluefin Tuna",  rarity: "rare",      skp: 350,   color: "#1a6fa8", size: 0.9, emoji: "🐟" },
  { id: "swordfish", name: "Swordfish",     rarity: "epic",      skp: 750,   color: "#7b5ea7", size: 1.1, emoji: "⚔️🐟" },
  { id: "dolphin",   name: "SKP Dolphin",   rarity: "epic",      skp: 1200,  color: "#22b8d1", size: 1.3, emoji: "🐬" },
  { id: "legendary", name: "Legend Fish",   rarity: "legendary", skp: 5000,  color: "#f5c518", size: 1.6, emoji: "✨🐟" },
];

const RARITY_WEIGHTS = { common: 55, rare: 28, epic: 14, legendary: 3 };

function pickRandomFish(): FishType {
  const roll = Math.random() * 100;
  let acc = 0;
  for (const [rarity, weight] of Object.entries(RARITY_WEIGHTS)) {
    acc += weight;
    if (roll < acc) {
      const pool = FISH_TYPES.filter((f) => f.rarity === rarity);
      return pool[Math.floor(Math.random() * pool.length)]!;
    }
  }
  return FISH_TYPES[0]!;
}

const DAILY_LIMIT = 25;
const SKP_KEY = "tempMiningPoints";
const FISH_COUNT_KEY = "fishingDailyCount";
const FISH_DATE_KEY = "fishingDailyDate";

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function loadSkp() {
  return parseInt(localStorage.getItem(SKP_KEY) ?? "0", 10) || 0;
}

function saveSkp(amount: number) {
  const current = loadSkp();
  localStorage.setItem(SKP_KEY, String(current + amount));
}

function getDailyCount() {
  const today = getTodayKey();
  if (localStorage.getItem(FISH_DATE_KEY) !== today) {
    localStorage.setItem(FISH_DATE_KEY, today);
    localStorage.setItem(FISH_COUNT_KEY, "0");
    return 0;
  }
  return parseInt(localStorage.getItem(FISH_COUNT_KEY) ?? "0", 10) || 0;
}

function bumpDailyCount() {
  const count = getDailyCount() + 1;
  localStorage.setItem(FISH_COUNT_KEY, String(count));
  return count;
}

interface CaughtFish {
  fish: FishType;
  skp: number;
  ts: number;
}

interface GameState {
  phase: GamePhase;
  castPower: number;
  castAngle: number;
  bobberX: number;
  bobberZ: number;
  currentFish: FishType | null;
  biteTimer: number;
  reelingProgress: number;
  totalSkp: number;
  sessionSkp: number;
  dailyCount: number;
  caughtHistory: CaughtFish[];
  showCatchPopup: boolean;
  lastCatch: CaughtFish | null;
  charging: boolean;
  chargeStart: number;
  chargeLevel: number;

  startCharge: () => void;
  releaseCharge: () => void;
  tick: (dt: number) => void;
  reel: () => void;
  resetToIdle: () => void;
}

export const useGameStore = create<GameState>((set, get) => ({
  phase: "IDLE",
  castPower: 0,
  castAngle: 0,
  bobberX: 0,
  bobberZ: -4,
  currentFish: null,
  biteTimer: 0,
  reelingProgress: 0,
  totalSkp: loadSkp(),
  sessionSkp: 0,
  dailyCount: getDailyCount(),
  caughtHistory: [],
  showCatchPopup: false,
  lastCatch: null,
  charging: false,
  chargeStart: 0,
  chargeLevel: 0,

  startCharge() {
    if (get().phase !== "IDLE") return;
    if (get().dailyCount >= DAILY_LIMIT) return;
    set({ charging: true, chargeStart: Date.now(), chargeLevel: 0 });
  },

  releaseCharge() {
    const { charging, chargeLevel, phase } = get();
    if (!charging || phase !== "IDLE") return;
    const angle = (Math.random() - 0.5) * 1.2;
    const dist = 3 + chargeLevel * 5;
    set({
      charging: false,
      phase: "CASTING",
      castPower: chargeLevel,
      castAngle: angle,
      bobberX: Math.sin(angle) * dist,
      bobberZ: -(3 + dist * 0.8),
    });
    setTimeout(() => {
      if (get().phase !== "CASTING") return;
      const waitTime = 3000 + Math.random() * 6000;
      set({ phase: "WAITING", biteTimer: waitTime });
    }, 1000);
  },

  tick(dt: number) {
    const state = get();

    if (state.charging) {
      const elapsed = (Date.now() - state.chargeStart) / 1000;
      set({ chargeLevel: Math.min(1, elapsed / 2) });
    }

    if (state.phase === "WAITING") {
      const newTimer = state.biteTimer - dt;
      if (newTimer <= 0) {
        set({ phase: "BITING", biteTimer: 2500, currentFish: pickRandomFish() });
      } else {
        set({ biteTimer: newTimer });
      }
    }

    if (state.phase === "BITING") {
      const newTimer = state.biteTimer - dt;
      if (newTimer <= 0) {
        set({ phase: "MISS", currentFish: null });
        setTimeout(() => get().resetToIdle(), 2000);
      } else {
        set({ biteTimer: newTimer });
      }
    }

    if (state.phase === "REELING") {
      const newProgress = state.reelingProgress + dt * 0.0006;
      if (newProgress >= 1) {
        const fish = state.currentFish!;
        const skp = fish.skp;
        saveSkp(skp);
        bumpDailyCount();
        const caught: CaughtFish = { fish, skp, ts: Date.now() };
        set({
          phase: "CATCH",
          reelingProgress: 1,
          sessionSkp: state.sessionSkp + skp,
          totalSkp: loadSkp(),
          dailyCount: getDailyCount(),
          caughtHistory: [caught, ...state.caughtHistory].slice(0, 10),
          showCatchPopup: true,
          lastCatch: caught,
        });
        setTimeout(() => {
          set({ showCatchPopup: false });
          get().resetToIdle();
        }, 2500);
      } else {
        set({ reelingProgress: newProgress });
      }
    }
  },

  reel() {
    const { phase } = get();
    if (phase === "BITING") {
      set({ phase: "REELING", reelingProgress: 0, biteTimer: 0 });
    }
  },

  resetToIdle() {
    set({
      phase: "IDLE",
      castPower: 0,
      castAngle: 0,
      bobberX: 0,
      bobberZ: -4,
      currentFish: null,
      biteTimer: 0,
      reelingProgress: 0,
      charging: false,
      chargeLevel: 0,
    });
  },
}));
