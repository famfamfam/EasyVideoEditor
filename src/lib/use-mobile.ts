/**
 * useMobileLayout — detects compact (phone/tablet) screen size and orientation.
 *
 * The threshold is 1024px so tablets in portrait (iPad ≈768–834, many Android
 * tablets) get the touch-friendly tabbed layout instead of a cramped 3-column
 * desktop view. Tablets in landscape (≥1024px) keep the full desktop layout.
 *
 * Returns:
 *   isMobile     – viewport width < 1024px (use the compact/tabbed layout)
 *   isLandscape  – landscape orientation AND compact-sized
 *   isPortrait   – portrait orientation AND compact-sized
 */
import { useSyncExternalStore } from 'react';

const COMPACT_MAX = 1024;

interface MobileInfo {
  isMobile: boolean;
  isLandscape: boolean;
  isPortrait: boolean;
}

function getSnapshot(): MobileInfo {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const isMobile = w < COMPACT_MAX;
  const isLandscape = isMobile && w > h;
  const isPortrait = isMobile && !isLandscape;
  return { isMobile, isLandscape, isPortrait };
}

// Cache to avoid re-creating object every call when nothing changed
let cached: MobileInfo = { isMobile: false, isLandscape: false, isPortrait: false };
let cacheKey = '';

function getCachedSnapshot(): MobileInfo {
  const snap = getSnapshot();
  const key = `${snap.isMobile}-${snap.isLandscape}`;
  if (key !== cacheKey) {
    cached = snap;
    cacheKey = key;
  }
  return cached;
}

function subscribe(cb: () => void) {
  const mql = window.matchMedia('(orientation: landscape)');
  const handler = () => cb();
  window.addEventListener('resize', handler);
  mql.addEventListener('change', handler);
  return () => {
    window.removeEventListener('resize', handler);
    mql.removeEventListener('change', handler);
  };
}

const serverSnapshot: MobileInfo = { isMobile: false, isLandscape: false, isPortrait: false };

export function useMobileLayout(): MobileInfo {
  return useSyncExternalStore(subscribe, getCachedSnapshot, () => serverSnapshot);
}
