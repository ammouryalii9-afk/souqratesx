import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useVault } from './VaultContext';
import {
  computeLevel, getLevelDef, getLevelProgress, FEATURE_LEVEL_REQUIRED,
  type LevelDef,
} from '../lib/levels';

// ── localStorage helpers ────────────────────────────────────────────────────

const ADS_KEY    = 'skx_total_ads_watched';
const TASKS_KEY  = 'skx_total_tasks_completed';
const LEVEL_KEY  = 'skx_computed_level';

// Module-level variable: persists across React StrictMode remounts and component
// re-creations. Initialized to null so the first mount can sync to current level
// without showing a false level-up modal.
let _seenLevel: number | null = null;

export function incrementAdsWatched() {
  const cur = parseInt(localStorage.getItem(ADS_KEY) ?? '0', 10);
  localStorage.setItem(ADS_KEY, String(cur + 1));
}

export function incrementTasksCompleted() {
  const cur = parseInt(localStorage.getItem(TASKS_KEY) ?? '0', 10);
  localStorage.setItem(TASKS_KEY, String(cur + 1));
}

export function getTotalAdsWatched(): number {
  return parseInt(localStorage.getItem(ADS_KEY) ?? '0', 10);
}

export function getTotalTasksCompleted(): number {
  return parseInt(localStorage.getItem(TASKS_KEY) ?? '0', 10);
}

// ── Context type ────────────────────────────────────────────────────────────

type LevelContextType = {
  level: number;
  levelDef: LevelDef;
  progress: number;
  nextSkp: number;
  currentSkp: number;
  totalAdsWatched: number;
  totalTasksCompleted: number;
  isFeatureUnlocked: (feature: string) => boolean;
  requiredLevelFor: (feature: string) => number;
  // Called externally when user watches ad or completes task
  notifyAdWatched: () => void;
  notifyTaskCompleted: () => void;
  // Level-up event
  pendingLevelUp: LevelDef | null;
  dismissLevelUp: () => void;
};

const LevelContext = createContext<LevelContextType | null>(null);

export function useLevel() {
  const ctx = useContext(LevelContext);
  if (!ctx) throw new Error('useLevel must be used within LevelProvider');
  return ctx;
}

// ── Provider ────────────────────────────────────────────────────────────────

export function LevelProvider({ children }: { children: React.ReactNode }) {
  const { lifetimePoints, starsPaidLevel } = useVault();

  const [totalAds, setTotalAds]   = useState(getTotalAdsWatched);
  const [totalTasks, setTotalTasks] = useState(getTotalTasksCompleted);
  const [pendingLevelUp, setPendingLevelUp] = useState<LevelDef | null>(null);

  const level = computeLevel(lifetimePoints, totalAds, starsPaidLevel);

  // Detect genuine level-up during this session.
  // _seenLevel is module-level so it survives React StrictMode double-mount,
  // which would otherwise re-initialize a useRef and miss the change.
  useEffect(() => {
    if (_seenLevel === null) {
      // First run: silently record current level — no modal for levels already reached.
      _seenLevel = level;
      localStorage.setItem(LEVEL_KEY, String(level));
      return;
    }
    if (level > _seenLevel) {
      _seenLevel = level;
      localStorage.setItem(LEVEL_KEY, String(level));
      setPendingLevelUp(getLevelDef(level));
    }
  }, [level]);

  const levelDef = getLevelDef(level);
  const { progress, nextSkp, currentSkp } = getLevelProgress(lifetimePoints, level);

  const notifyAdWatched = useCallback(() => {
    incrementAdsWatched();
    setTotalAds(getTotalAdsWatched());
  }, []);

  const notifyTaskCompleted = useCallback(() => {
    incrementTasksCompleted();
    setTotalTasks(getTotalTasksCompleted());
  }, []);

  const isFeatureUnlocked = useCallback((feature: string) => {
    const required = FEATURE_LEVEL_REQUIRED[feature] ?? 1;
    return level >= required;
  }, [level]);

  const requiredLevelFor = useCallback((feature: string) => {
    return FEATURE_LEVEL_REQUIRED[feature] ?? 1;
  }, []);

  const dismissLevelUp = useCallback(() => setPendingLevelUp(null), []);

  return (
    <LevelContext.Provider value={{
      level,
      levelDef,
      progress,
      nextSkp,
      currentSkp,
      totalAdsWatched: totalAds,
      totalTasksCompleted: totalTasks,
      isFeatureUnlocked,
      requiredLevelFor,
      notifyAdWatched,
      notifyTaskCompleted,
      pendingLevelUp,
      dismissLevelUp,
    }}>
      {children}
    </LevelContext.Provider>
  );
}
