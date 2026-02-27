/**
 * Global editor store — Zustand.
 */
import { create } from 'zustand';
import type {
  MediaFile, Track, Clip, Transition, PlaybackState,
  Project, TrackKind, TransitionType, ExportSettings, TextItem,
} from '../types';
import { DEFAULT_TEXT_ITEM } from '../types';

let _id = 0;
export const uid = (prefix = 'id') => `${prefix}_${++_id}_${Date.now().toString(36)}`;

interface EditorState {
  project: Project;
  setProject: (p: Partial<Project>) => void;

  media: MediaFile[];
  addMedia: (files: MediaFile[]) => void;
  removeMedia: (id: string) => void;

  tracks: Track[];
  addTrack: (kind: TrackKind, name?: string) => string;
  removeTrack: (id: string) => void;
  updateTrack: (id: string, patch: Partial<Track>) => void;
  reorderTracks: (fromIdx: number, toIdx: number) => void;

  clips: Clip[];
  addClip: (clip: Omit<Clip, 'id'>) => string;
  removeClip: (id: string) => void;
  updateClip: (id: string, patch: Partial<Clip>) => void;
  moveClip: (id: string, newTrackId: string, newStart: number) => void;
  splitClip: (id: string, atTime: number) => void;
  extractAudio: (clipId: string) => void;

  textItems: TextItem[];
  addTextItem: (item?: Partial<Omit<TextItem, 'id'>>) => string;
  removeTextItem: (id: string) => void;
  updateTextItem: (id: string, patch: Partial<TextItem>) => void;

  transitions: Transition[];
  addTransition: (clipAId: string, clipBId: string, type: TransitionType, duration: number) => void;
  removeTransition: (id: string) => void;

  selectedClipIds: Set<string>;
  selectedTextId: string | null;
  selectClip: (id: string, multi?: boolean) => void;
  selectText: (id: string) => void;
  deselectAll: () => void;

  playback: PlaybackState;
  setPlaying: (v: boolean) => void;
  setCurrentTime: (t: number) => void;
  setPixelsPerSecond: (pps: number) => void;
  setScrollLeft: (s: number) => void;

  exportSettings: ExportSettings;
  setExportSettings: (s: Partial<ExportSettings>) => void;
  exporting: boolean;
  exportProgress: number;
  exportMessage: string;
  setExportState: (exporting: boolean, progress?: number, message?: string) => void;

  _history: Array<{ clips: Clip[]; tracks: Track[]; transitions: Transition[]; textItems: TextItem[] }>;
  _historyIdx: number;
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;

  totalDuration: () => number;
  getClipsOnTrack: (trackId: string) => Clip[];
}

export const useEditorStore = create<EditorState>((set, get) => ({
  project: { name: 'Без названия', width: 1280, height: 720, fps: 30 },
  setProject: (p) => set((s) => ({ project: { ...s.project, ...p } })),

  media: [],
  addMedia: (files) => set((s) => {
    // Auto-detect project resolution from first video if still at default
    const isDefault = s.project.width === 1280 && s.project.height === 720 && s.media.length === 0;
    let project = s.project;
    let exportSettings = s.exportSettings;
    if (isDefault) {
      const firstVideo = files.find((f) => f.type === 'video' && f.width && f.height);
      if (firstVideo && firstVideo.width && firstVideo.height) {
        // Round to even numbers (required by libx264)
        const w = Math.round(firstVideo.width / 2) * 2;
        const h = Math.round(firstVideo.height / 2) * 2;
        project = { ...s.project, width: w, height: h };
        exportSettings = { ...s.exportSettings, width: w, height: h };
      }
    }
    return { media: [...s.media, ...files], project, exportSettings };
  }),
  removeMedia: (id) =>
    set((s) => {
      const m = s.media.find((f) => f.id === id);
      if (m) URL.revokeObjectURL(m.url);
      return {
        media: s.media.filter((f) => f.id !== id),
        clips: s.clips.filter((c) => c.mediaId !== id),
      };
    }),

  tracks: [
    { id: 'v1', kind: 'video', name: 'Video 1', muted: false, locked: false, visible: true, volume: 1 },
    { id: 'v2', kind: 'video', name: 'Video 2', muted: false, locked: false, visible: true, volume: 1 },
    { id: 't1', kind: 'text', name: 'Text 1', muted: false, locked: false, visible: true, volume: 1 },
    { id: 'a1', kind: 'audio', name: 'Audio 1', muted: false, locked: false, visible: true, volume: 1 },
    { id: 'a2', kind: 'audio', name: 'Audio 2', muted: false, locked: false, visible: true, volume: 1 },
  ],
  addTrack: (kind, name) => {
    const id = uid(kind === 'video' ? 'v' : kind === 'text' ? 't' : 'a');
    const count = get().tracks.filter((t) => t.kind === kind).length + 1;
    const defaultName = kind === 'video' ? 'Video' : kind === 'text' ? 'Text' : 'Audio';
    const track: Track = {
      id, kind, name: name ?? `${defaultName} ${count}`,
      muted: false, locked: false, visible: true, volume: 1,
    };
    set((s) => ({ tracks: [...s.tracks, track] }));
    return id;
  },
  removeTrack: (id) =>
    set((s) => ({
      tracks: s.tracks.filter((t) => t.id !== id),
      clips: s.clips.filter((c) => c.trackId !== id),
      textItems: s.textItems.filter((ti) => ti.trackId !== id),
    })),
  updateTrack: (id, patch) =>
    set((s) => ({ tracks: s.tracks.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),
  reorderTracks: (from, to) =>
    set((s) => {
      const t = [...s.tracks];
      const [moved] = t.splice(from, 1);
      t.splice(to, 0, moved);
      return { tracks: t };
    }),

  clips: [],
  addClip: (clip) => {
    const id = uid('clip');
    set((s) => ({ clips: [...s.clips, { ...clip, id }] }));
    get().pushHistory();
    return id;
  },
  removeClip: (id) => {
    set((s) => ({
      clips: s.clips.filter((c) => c.id !== id),
      transitions: s.transitions.filter((t) => t.clipAId !== id && t.clipBId !== id),
      selectedClipIds: (() => { const n = new Set(s.selectedClipIds); n.delete(id); return n; })(),
    }));
    get().pushHistory();
  },
  updateClip: (id, patch) => {
    set((s) => ({ clips: s.clips.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
  },
  moveClip: (id, newTrackId, newStart) => {
    set((s) => ({
      clips: s.clips.map((c) =>
        c.id === id ? { ...c, trackId: newTrackId, startOnTimeline: Math.max(0, newStart) } : c,
      ),
    }));
    get().pushHistory();
  },
  splitClip: (clipId, atTime) => {
    const s = get();
    const clip = s.clips.find((c) => c.id === clipId);
    if (!clip) return;
    if (atTime <= clip.startOnTimeline || atTime >= clip.startOnTimeline + clip.duration) return;

    const elapsed = atTime - clip.startOnTimeline;
    const splitSourcePoint = clip.sourceStart + elapsed * clip.speed;
    const newId = uid('clip');

    set((state) => ({
      clips: [
        ...state.clips.map((c) =>
          c.id === clipId ? { ...c, duration: elapsed, sourceEnd: splitSourcePoint, fadeOut: 0 } : c,
        ),
        {
          trackId: clip.trackId,
          mediaId: clip.mediaId,
          startOnTimeline: atTime,
          duration: clip.duration - elapsed,
          sourceStart: splitSourcePoint,
          sourceEnd: clip.sourceEnd,
          speed: clip.speed,
          volume: clip.volume,
          fadeIn: 0,
          fadeOut: clip.fadeOut,
          effects: clip.effects ? { ...clip.effects } : undefined,
          id: newId,
        },
      ],
    }));
    get().pushHistory();
  },
  extractAudio: (clipId) => {
    const s = get();
    const clip = s.clips.find((c) => c.id === clipId);
    if (!clip) return;
    const media = s.media.find((m) => m.id === clip.mediaId);
    if (!media || media.type !== 'video') return;

    let audioTrack = s.tracks.find((t) => t.kind === 'audio');
    let newTracks = s.tracks;
    if (!audioTrack) {
      const atId = uid('a');
      audioTrack = { id: atId, kind: 'audio' as const, name: 'Audio 1', muted: false, locked: false, visible: true, volume: 1 };
      newTracks = [...s.tracks, audioTrack];
    }

    const audioClip: Clip = {
      id: uid('clip'),
      trackId: audioTrack.id,
      mediaId: clip.mediaId,
      startOnTimeline: clip.startOnTimeline,
      duration: clip.duration,
      sourceStart: clip.sourceStart,
      sourceEnd: clip.sourceEnd,
      speed: clip.speed,
      volume: clip.volume,
      fadeIn: clip.fadeIn,
      fadeOut: clip.fadeOut,
    };

    set((state) => ({
      tracks: newTracks,
      clips: [
        ...state.clips.map((c) => c.id === clipId ? { ...c, volume: 0 } : c),
        audioClip,
      ],
    }));
    get().pushHistory();
  },

  textItems: [],
  addTextItem: (partialItem) => {
    const s = get();
    let textTrack = s.tracks.find((t) => t.kind === 'text');
    let newTracks = s.tracks;
    if (!textTrack) {
      const tId = uid('t');
      textTrack = { id: tId, kind: 'text' as const, name: 'Текст 1', muted: false, locked: false, visible: true, volume: 1 };
      newTracks = [...s.tracks, textTrack];
    }
    const id = uid('txt');
    const item: TextItem = {
      id, trackId: textTrack.id, startOnTimeline: s.playback.currentTime,
      ...DEFAULT_TEXT_ITEM, ...partialItem,
    };
    set({ tracks: newTracks, textItems: [...s.textItems, item], selectedTextId: id, selectedClipIds: new Set() });
    get().pushHistory();
    return id;
  },
  removeTextItem: (id) => {
    set((s) => ({
      textItems: s.textItems.filter((ti) => ti.id !== id),
      selectedTextId: s.selectedTextId === id ? null : s.selectedTextId,
    }));
    get().pushHistory();
  },
  updateTextItem: (id, patch) => {
    set((s) => ({ textItems: s.textItems.map((ti) => (ti.id === id ? { ...ti, ...patch } : ti)) }));
  },

  transitions: [],
  addTransition: (clipAId, clipBId, type, duration) => {
    const s = get();
    const clipA = s.clips.find((c) => c.id === clipAId);
    const clipB = s.clips.find((c) => c.id === clipBId);
    if (!clipA || !clipB) return;

    // Ensure outgoing = clip that ends first, incoming = clip that starts second
    const [outgoing, incoming] =
      clipA.startOnTimeline + clipA.duration <= clipB.startOnTimeline + clipB.duration
        ? [clipA, clipB]
        : [clipB, clipA];

    const outEnd = outgoing.startOnTimeline + outgoing.duration;
    const inStart = incoming.startOnTimeline;
    const existingOverlap = Math.max(0, outEnd - inStart);

    // How much additional overlap we need (on top of what already exists)
    const needed = Math.max(0, duration - existingOverlap);

    // Each clip contributes half. Clamp by available source material (min 0.1s remaining)
    const maxTrimOut = Math.max(0, (outgoing.sourceEnd - outgoing.sourceStart) - 0.1);
    const maxTrimIn  = Math.max(0, (incoming.sourceEnd - incoming.sourceStart) - 0.1);
    const trimOut = Math.min(needed / 2, maxTrimOut);
    const trimIn  = Math.min(needed / 2, maxTrimIn);
    const actualDur = existingOverlap + trimOut + trimIn;

    // Extend outgoing duration (use more source frames at the end)
    const newOutDuration = outgoing.duration + trimOut;
    const newOutSourceEnd = Math.min(outgoing.sourceEnd + trimOut, outgoing.sourceEnd + maxTrimOut);

    // Move incoming left (earlier on timeline, use more source frames at the start)
    const newInStart = incoming.startOnTimeline - trimIn;
    const newInDuration = incoming.duration + trimIn;
    const newInSourceStart = Math.max(0, incoming.sourceStart - trimIn);

    set((state) => ({
      transitions: [
        // Replace any existing transitions between these two clips
        ...state.transitions.filter(
          (t) => !(
            (t.clipAId === outgoing.id || t.clipBId === outgoing.id) &&
            (t.clipAId === incoming.id || t.clipBId === incoming.id)
          )
        ),
        { id: uid('tr'), clipAId: outgoing.id, clipBId: incoming.id, type, duration: actualDur },
      ],
      clips: state.clips.map((c) => {
        if (c.id === outgoing.id) return { ...c, duration: newOutDuration, sourceEnd: newOutSourceEnd };
        if (c.id === incoming.id) return { ...c, startOnTimeline: newInStart, duration: newInDuration, sourceStart: newInSourceStart };
        return c;
      }),
    }));
    get().pushHistory();
  },
  removeTransition: (id) =>
    set((s) => ({ transitions: s.transitions.filter((t) => t.id !== id) })),

  selectedClipIds: new Set(),
  selectedTextId: null,
  selectClip: (id, multi) =>
    set((s) => {
      if (multi) {
        const next = new Set(s.selectedClipIds);
        if (next.has(id)) next.delete(id); else next.add(id);
        return { selectedClipIds: next, selectedTextId: null };
      }
      return { selectedClipIds: new Set([id]), selectedTextId: null };
    }),
  selectText: (id) => set({ selectedTextId: id, selectedClipIds: new Set() }),
  deselectAll: () => set({ selectedClipIds: new Set(), selectedTextId: null }),

  playback: { playing: false, currentTime: 0, pixelsPerSecond: 80, scrollLeft: 0 },
  setPlaying: (v) => set((s) => ({ playback: { ...s.playback, playing: v } })),
  setCurrentTime: (t) => set((s) => ({ playback: { ...s.playback, currentTime: Math.max(0, t) } })),
  setPixelsPerSecond: (pps) =>
    set((s) => ({ playback: { ...s.playback, pixelsPerSecond: Math.max(10, Math.min(500, pps)) } })),
  setScrollLeft: (sl) => set((s) => ({ playback: { ...s.playback, scrollLeft: Math.max(0, sl) } })),

  exportSettings: { width: 1280, height: 720, fps: 30, crf: 23 },
  setExportSettings: (patch) => set((s) => ({ exportSettings: { ...s.exportSettings, ...patch } })),
  exporting: false,
  exportProgress: 0,
  exportMessage: '',
  setExportState: (exporting, progress = 0, message = '') =>
    set({ exporting, exportProgress: progress, exportMessage: message }),

  _history: [],
  _historyIdx: -1,
  pushHistory: () =>
    set((s) => {
      const snap = {
        clips: structuredClone(s.clips),
        tracks: structuredClone(s.tracks),
        transitions: structuredClone(s.transitions),
        textItems: structuredClone(s.textItems),
      };
      const hist = s._history.slice(0, s._historyIdx + 1);
      hist.push(snap);
      if (hist.length > 50) hist.shift();
      return { _history: hist, _historyIdx: hist.length - 1 };
    }),
  undo: () =>
    set((s) => {
      const idx = s._historyIdx - 1;
      if (idx < 0) return s;
      return { ...s._history[idx], _historyIdx: idx };
    }),
  redo: () =>
    set((s) => {
      const idx = s._historyIdx + 1;
      if (idx >= s._history.length) return s;
      return { ...s._history[idx], _historyIdx: idx };
    }),

  totalDuration: () => {
    const { clips, textItems } = get();
    const clipEnd = clips.length > 0 ? Math.max(...clips.map((c) => c.startOnTimeline + c.duration)) : 0;
    const textEnd = textItems.length > 0 ? Math.max(...textItems.map((t) => t.startOnTimeline + t.duration)) : 0;
    return Math.max(clipEnd, textEnd);
  },
  getClipsOnTrack: (trackId) => get().clips.filter((c) => c.trackId === trackId),
}));
