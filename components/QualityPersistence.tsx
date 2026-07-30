'use client';

import { useEffect } from 'react';
import {
  type QualityMode,
  type RenderQuality,
  useSimStore,
} from '@/store/useSimStore';

const STORAGE_KEY = 'boat-simulator-quality-v1';
const QUALITY_MODES: QualityMode[] = [
  'auto',
  'low',
  'medium',
  'high',
  'ultra',
];
const RENDER_QUALITIES: RenderQuality[] = [
  'low',
  'medium',
  'high',
  'ultra',
];

interface StoredQualityPreference {
  version: 1;
  qualityMode: QualityMode;
  renderQuality: RenderQuality;
}

interface NavigatorWithMemory extends Navigator {
  deviceMemory?: number;
}

function isQualityMode(value: unknown): value is QualityMode {
  return QUALITY_MODES.includes(value as QualityMode);
}

function isRenderQuality(value: unknown): value is RenderQuality {
  return RENDER_QUALITIES.includes(value as RenderQuality);
}

function readStoredPreference(): StoredQualityPreference | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const value = JSON.parse(raw) as Partial<StoredQualityPreference>;
    if (
      value.version !== 1 ||
      !isQualityMode(value.qualityMode) ||
      !isRenderQuality(value.renderQuality)
    ) {
      return null;
    }

    return value as StoredQualityPreference;
  } catch {
    return null;
  }
}

function chooseAutomaticStartingQuality(): RenderQuality {
  const navigatorWithMemory = navigator as NavigatorWithMemory;
  const memory = navigatorWithMemory.deviceMemory ?? 8;
  const cores = navigator.hardwareConcurrency || 8;
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
  const compactViewport = Math.min(window.innerWidth, window.innerHeight) < 760;
  const highPixelDensity = window.devicePixelRatio >= 2.5;

  let pressure = 0;
  if (memory <= 4) pressure += 2;
  else if (memory <= 6) pressure += 1;

  if (cores <= 4) pressure += 2;
  else if (cores <= 6) pressure += 1;

  if (coarsePointer) pressure += 1;
  if (compactViewport) pressure += 1;
  if (highPixelDensity) pressure += 1;

  if (pressure >= 4) return 'low';
  if (pressure >= 2) return 'medium';
  return 'high';
}

function persistPreference(
  qualityMode: QualityMode,
  renderQuality: RenderQuality,
) {
  try {
    const preference: StoredQualityPreference = {
      version: 1,
      qualityMode,
      renderQuality,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preference));
  } catch {
    // Quality remains fully functional when storage is unavailable.
  }
}

/**
 * Restores quality choices and gives Auto mode a conservative first tier on
 * mobile, high-DPR, low-memory, and low-core devices.
 */
export default function QualityPersistence() {
  useEffect(() => {
    const stored = readStoredPreference();
    const store = useSimStore.getState();

    if (stored) {
      store.setRenderQuality(stored.renderQuality);
      store.setQualityMode(stored.qualityMode);
    } else if (store.qualityMode === 'auto') {
      store.setRenderQuality(chooseAutomaticStartingQuality());
      const initial = useSimStore.getState();
      persistPreference(initial.qualityMode, initial.renderQuality);
    }

    let writeTimer: number | undefined;
    const unsubscribe = useSimStore.subscribe((state, previousState) => {
      if (
        state.qualityMode === previousState.qualityMode &&
        state.renderQuality === previousState.renderQuality
      ) {
        return;
      }

      if (writeTimer !== undefined) window.clearTimeout(writeTimer);
      writeTimer = window.setTimeout(() => {
        persistPreference(state.qualityMode, state.renderQuality);
      }, 300);
    });

    return () => {
      unsubscribe();
      if (writeTimer !== undefined) window.clearTimeout(writeTimer);
    };
  }, []);

  return null;
}
