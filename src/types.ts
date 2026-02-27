/**
 * Core types for Video Editor V1 NLE.
 */

/* ── Media ──────────────────────────────────────────────── */

export interface MediaFile {
  id: string;
  name: string;
  type: 'video' | 'audio' | 'image';
  url: string;
  file: File;
  duration: number;
  width?: number;
  height?: number;
  thumbnail?: string;
  filmstrip?: string[];
}

/* ── Timeline ───────────────────────────────────────────── */

export type TrackKind = 'video' | 'audio' | 'text';

export interface Track {
  id: string;
  kind: TrackKind;
  name: string;
  muted: boolean;
  locked: boolean;
  visible: boolean;
  volume: number;
}

export interface Clip {
  id: string;
  trackId: string;
  mediaId: string;
  startOnTimeline: number;
  duration: number;
  sourceStart: number;
  sourceEnd: number;
  speed: number;
  volume: number;
  fadeIn: number;
  fadeOut: number;
  effects?: ClipEffects;
}

export interface ClipEffects {
  brightness?: number;
  contrast?: number;
  saturation?: number;
  blur?: number;
  grayscale?: number;
  sepia?: number;
  hueRotate?: number;
  invert?: number;
  opacity?: number;
}

export interface TextItem {
  id: string;
  trackId: string;
  startOnTimeline: number;
  duration: number;
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  backgroundColor: string;
  textAlign: 'left' | 'center' | 'right';
  x: number;
  y: number;
  opacity: number;
  fadeIn: number;
  fadeOut: number;
  strokeColor: string;
  strokeWidth: number;
  shadowBlur: number;
  shadowColor: string;
}

export const DEFAULT_TEXT_ITEM: Omit<TextItem, 'id' | 'trackId' | 'startOnTimeline'> = {
  duration: 5,
  text: 'Новый текст',
  fontFamily: 'sans-serif',
  fontSize: 64,
  fontWeight: 700,
  color: '#ffffff',
  backgroundColor: '',
  textAlign: 'center',
  x: 0.5,
  y: 0.5,
  opacity: 1,
  fadeIn: 0.3,
  fadeOut: 0.3,
  strokeColor: '#000000',
  strokeWidth: 0,
  shadowBlur: 4,
  shadowColor: 'rgba(0,0,0,0.6)',
};

/* ── Transitions ────────────────────────────────────────── */

export interface Transition {
  id: string;
  clipAId: string;
  clipBId: string;
  type: TransitionType;
  duration: number;
}

export type TransitionType =
  | 'crossfade'
  | 'fade-black'
  | 'fade-white'
  | 'wipe-left'
  | 'wipe-right'
  | 'wipe-up'
  | 'wipe-down'
  | 'slide-left'
  | 'slide-right'
  | 'dissolve';

/* ── Playback ───────────────────────────────────────────── */

export interface PlaybackState {
  playing: boolean;
  currentTime: number;
  pixelsPerSecond: number;
  scrollLeft: number;
}

/* ── Export ──────────────────────────────────────────────── */

export interface ExportSettings {
  width: number;
  height: number;
  fps: number;
  crf: number;
}

export const DEFAULT_EXPORT_SETTINGS: ExportSettings = {
  width: 1280,
  height: 720,
  fps: 30,
  crf: 23,
};

/* ── Project ────────────────────────────────────────────── */

export interface Project {
  name: string;
  width: number;
  height: number;
  fps: number;
}

export const DEFAULT_PROJECT: Project = {
  name: 'Без названия',
  width: 1280,
  height: 720,
  fps: 30,
};
