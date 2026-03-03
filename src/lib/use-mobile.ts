/**
 * useMobileLayout — detects mobile screen size and orientation.
 *
 * Returns:
 *   isMobile     – viewport width < 768px (Tailwind md breakpoint)
 *   isLandscape  – device is in landscape orientation AND is mobile-sized
 *   isPortrait   – device is in portrait orientation AND is mobile-sized
 */
import { useSyncExternalStore } from 'react';

interface MobileInfo {
  isMobile: boolean;
  isLandscape: boolean;
  isPortrait: boolean;
}

function getSnapshot(): MobileInfo {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const isMobile = w < 768;
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
