/**
 * Timeline — multi-track NLE timeline with ruler, tracks, clips, text items,
 * transitions, playhead, zoom, drag-resize, and split.
 */
import React, { useCallback, useMemo, useRef, useState, useEffect, memo, type DragEvent } from 'react';
import {
  Plus, Minus, ZoomIn, Type, Scissors, Volume2, VolumeX, Lock, Unlock, Eye, EyeOff, ChevronRight, ChevronLeft, Trash2, Music, Film, SplitSquareVertical, ChevronDown,
} from 'lucide-react';
import { useEditorStore, uid } from '../store/editor-store';
import { importFiles } from '../lib/media-utils';
import type { Clip, TextItem, Track, Transition, TransitionType } from '../types';
import { t, useLang } from '../lib/i18n';

/* ── constants ────────────────────────────────────────────── */
const MIN_PPS = 20;
const MAX_PPS = 600;
const DEFAULT_PPS = 80;
const TRACK_H = 48;
const TEXT_TRACK_H = 40;
const RULER_H = 28;
const SNAP_PX = 6;
const HANDLE_W = 6;

/* track colours */
const TRACK_COLORS: Record<string, string> = {
  video: 'bg-accent/70',
  audio: 'bg-green-500/70',
  text: 'bg-amber-400/70',
};
const TRACK_BORDER_COLORS: Record<string, string> = {
  video: 'border-accent',
  audio: 'border-green-500',
  text: 'border-amber-400',
};

/* ── Ruler component ──────────────────────────────────────── */
function Ruler({ totalDur, pps, scrollLeft }: { totalDur: number; pps: number; scrollLeft: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    canvas.width = width * dpr;
    canvas.height = RULER_H * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, RULER_H);

    // determine tick interval
    let major = 1;
    if (pps < 30) major = 10;
    else if (pps < 60) major = 5;
    else if (pps < 120) major = 2;
    else if (pps < 300) major = 1;
    else major = 0.5;

    const startSec = Math.max(0, Math.floor(scrollLeft / pps / major) * major);
    const endSec = Math.min(totalDur + 10, (scrollLeft + width) / pps + major);

    ctx.fillStyle = '#1a1a25';
    ctx.fillRect(0, 0, width, RULER_H);

    for (let s = startSec; s <= endSec; s += major) {
      const x = s * pps - scrollLeft;
      if (x < -2 || x > width + 2) continue;
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, RULER_H - 12);
      ctx.lineTo(x, RULER_H);
      ctx.stroke();

      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.font = '10px system-ui';
      ctx.textAlign = 'center';
      const m = Math.floor(s / 60);
      const sec = s % 60;
      ctx.fillText(`${m}:${sec.toFixed(major < 1 ? 1 : 0).padStart(major < 1 ? 4 : 2, '0')}`, x, RULER_H - 14);

      // sub-ticks
      const sub = major / 4;
      for (let ss = s + sub; ss < s + major; ss += sub) {
        const sx = ss * pps - scrollLeft;
        if (sx < -2 || sx > width + 2) continue;
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.beginPath();
        ctx.moveTo(sx, RULER_H - 6);
        ctx.lineTo(sx, RULER_H);
        ctx.stroke();
      }
    }
  }, [totalDur, pps, scrollLeft]);

  return <canvas ref={canvasRef} className="w-full" style={{ height: RULER_H }} />;
}

/* ── Main Timeline ────────────────────────────────────────── */
export default function Timeline() {
  const tracks = useEditorStore((s) => s.tracks);
  const clips = useEditorStore((s) => s.clips);
  const textItems = useEditorStore((s) => s.textItems);
  const transitions = useEditorStore((s) => s.transitions);
  const media = useEditorStore((s) => s.media);
  const currentTime = useEditorStore((s) => s.playback.currentTime);
  const selectedClipIds = useEditorStore((s) => s.selectedClipIds);
  const selectedTextId = useEditorStore((s) => s.selectedTextId);  const selectClip = useEditorStore((s) => s.selectClip);
  const selectText = useEditorStore((s) => s.selectText);
  const deselectAll = useEditorStore((s) => s.deselectAll);
  const updateClip = useEditorStore((s) => s.updateClip);
  const updateTextItem = useEditorStore((s) => s.updateTextItem);
  const removeClip = useEditorStore((s) => s.removeClip);
  const removeTextItem = useEditorStore((s) => s.removeTextItem);
  const addClip = useEditorStore((s) => s.addClip);
  const addTextItem = useEditorStore((s) => s.addTextItem);
  const addTransition = useEditorStore((s) => s.addTransition);
  const updateTrack = useEditorStore((s) => s.updateTrack);
  const splitClip = useEditorStore((s) => s.splitClip);
  const setCurrentTime = useEditorStore((s) => s.setCurrentTime);
  const pushHistory = useEditorStore((s) => s.pushHistory);
  const addMedia = useEditorStore((s) => s.addMedia);
  const addTrack = useEditorStore((s) => s.addTrack);
  const removeTrack = useEditorStore((s) => s.removeTrack);
  const reorderTracks = useEditorStore((s) => s.reorderTracks);
  const totalDuration = useEditorStore((s) => s.totalDuration);

  const [pps, setPps] = useState(DEFAULT_PPS);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [showAddTrack, setShowAddTrack] = useState(false);
  const [dragTrackIdx, setDragTrackIdx] = useState<number | null>(null);
  const [dropTrackIdx, setDropTrackIdx] = useState<number | null>(null);
  const [dragging, setDragging] = useState<{ clipId: string; mode: 'move' | 'trimL' | 'trimR'; startX: number; origStart: number; origDur: number; origSrcStart: number; origSrcEnd: number; isText: boolean } | null>(null);
  const [transitionMenu, setTransitionMenu] = useState<{ clipA: string; clipB: string; x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tracksRef = useRef<HTMLDivElement>(null);
  useLang(); // re-render on language change

  // Pre-build mediaId → MediaFile map so ClipBlock doesn't call .find on every render
  const mediaMap = useMemo(() => new Map(media.map((m) => [m.id, m])), [media]);

  const dur = useMemo(() => totalDuration(), [totalDuration, clips, textItems]);
  const timelineW = Math.max((dur + 10) * pps, 1000);

  /* ── zoom ─── */
  const zoom = useCallback((delta: number) => {
    setPps((p) => Math.max(MIN_PPS, Math.min(MAX_PPS, p + delta)));
  }, []);

  /* ── scroll sync ─── */
  const handleScroll = useCallback(() => {
    if (tracksRef.current) setScrollLeft(tracksRef.current.scrollLeft);
  }, []);

  /* ── click on ruler → seek ─── */
  const handleRulerClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left + scrollLeft;
    setCurrentTime(Math.max(0, x / pps));
  }, [scrollLeft, pps, setCurrentTime]);

  /* ── snap helpers ─── */
  const snapPoints = useMemo(() => {
    const pts = new Set<number>();
    pts.add(0);
    pts.add(currentTime);
    clips.forEach((c) => { pts.add(c.startOnTimeline); pts.add(c.startOnTimeline + c.duration); });
    textItems.forEach((t) => { pts.add(t.startOnTimeline); pts.add(t.startOnTimeline + t.duration); });
    return [...pts];
  }, [clips, textItems, currentTime]);

  const snapTo = useCallback((val: number): number => {
    for (const p of snapPoints) {
      if (Math.abs((p - val) * pps) < SNAP_PX) return p;
    }
    return val;
  }, [snapPoints, pps]);

  /* ── drag move / trim ─── */
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - dragging.startX;
      const dt = dx / pps;

      if (dragging.mode === 'move') {
        const newStart = snapTo(Math.max(0, dragging.origStart + dt));
        if (dragging.isText) {
          updateTextItem(dragging.clipId, { startOnTimeline: newStart });
        } else {
          updateClip(dragging.clipId, { startOnTimeline: newStart });
        }
      } else if (dragging.mode === 'trimL') {
        const newStart = snapTo(Math.max(0, dragging.origStart + dt));
        const delta = newStart - dragging.origStart;
        const newDur = Math.max(0.1, dragging.origDur - delta);
        if (dragging.isText) {
          updateTextItem(dragging.clipId, { startOnTimeline: newStart, duration: newDur });
        } else {
          const newSrcStart = Math.max(0, dragging.origSrcStart + delta * 1);
          updateClip(dragging.clipId, { startOnTimeline: newStart, duration: newDur, sourceStart: newSrcStart });
        }
      } else if (dragging.mode === 'trimR') {
        const newDur = snapTo(dragging.origStart + Math.max(0.1, dragging.origDur + dt)) - dragging.origStart;
        if (dragging.isText) {
          updateTextItem(dragging.clipId, { duration: Math.max(0.1, newDur) });
        } else {
          const newSrcEnd = dragging.origSrcStart + Math.max(0.1, newDur);
          updateClip(dragging.clipId, { duration: Math.max(0.1, newDur), sourceEnd: newSrcEnd });
        }
      }
    };
    const onUp = () => setDragging(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [dragging, pps, snapTo, updateClip, updateTextItem]);

  /* ── start drag ─── */
  const startDrag = useCallback((e: React.MouseEvent, id: string, mode: 'move' | 'trimL' | 'trimR', isText: boolean) => {
    e.stopPropagation();
    // Check if track is locked
    const item = isText ? textItems.find((t) => t.id === id) : clips.find((c) => c.id === id);
    if (!item) return;
    const track = tracks.find((t) => t.id === item.trackId);
    if (track?.locked) return; // locked tracks cannot be edited
    pushHistory();
    setDragging({
      clipId: id, mode, startX: e.clientX, isText,
      origStart: item.startOnTimeline,
      origDur: item.duration,
      origSrcStart: isText ? 0 : (item as Clip).sourceStart,
      origSrcEnd: isText ? 0 : (item as Clip).sourceEnd,
    });
    if (isText) selectText(id);
    else selectClip(id, e.ctrlKey || e.metaKey);
  }, [clips, textItems, tracks, pushHistory, selectClip, selectText]);

  /* ── drop from MediaPanel ─── */
  const handleDrop = useCallback(async (e: DragEvent<HTMLDivElement>, trackId: string) => {
    e.preventDefault();
    const mediaId = e.dataTransfer.getData('application/x-media-id');
    if (!mediaId) {
      // maybe a file drop — importFiles expects FileList
      const files = e.dataTransfer.files;
      if (files.length) {
        const imported = await importFiles(files);
        addMedia(imported);
      }
      return;
    }
    const mf = media.find((m) => m.id === mediaId);
    if (!mf) return;
    const track = tracks.find((t) => t.id === trackId);
    if (!track) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left + (tracksRef.current?.scrollLeft ?? 0);
    const startT = snapTo(Math.max(0, x / pps));
    const clipDur = mf.duration || 5;

    pushHistory();
    addClip({
      trackId, mediaId: mf.id,
      startOnTimeline: startT, duration: clipDur,
      sourceStart: 0, sourceEnd: clipDur,
      speed: 1, volume: 1, fadeIn: 0, fadeOut: 0,
    });
  }, [media, tracks, pps, snapTo, pushHistory, addClip, addMedia]);

  /* ── add text to first text track ─── */
  const handleAddText = useCallback(() => {
    const textTrack = tracks.find((t) => t.kind === 'text');
    if (!textTrack) return;
    pushHistory();
    const newId = addTextItem({
      trackId: textTrack.id,
      startOnTimeline: currentTime, duration: 3,
      text: t('text'), fontFamily: 'sans-serif', fontSize: 64, fontWeight: 700,
      color: '#ffffff', backgroundColor: '', textAlign: 'center',
      x: 0.5, y: 0.5, opacity: 1, fadeIn: 0.3, fadeOut: 0.3,
      strokeColor: '#000000', strokeWidth: 2, shadowBlur: 4, shadowColor: '#000000',
    });
    selectText(newId);
  }, [tracks, currentTime, pushHistory, addTextItem, selectText]);

  /* ── handle split at playhead ─── */
  const handleSplit = useCallback(() => {
    selectedClipIds.forEach((id) => splitClip(id, currentTime));
  }, [selectedClipIds, currentTime, splitClip]);

  /* ── right-click on clip → transition menu ─── */
  const handleClipContextMenu = useCallback((e: React.MouseEvent, clipId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const clip = clips.find((c) => c.id === clipId);
    if (!clip) return;
    // Find adjacent clip on the same track (next clip)
    const sameTrack = clips
      .filter((c) => c.trackId === clip.trackId && c.id !== clip.id)
      .sort((a, b) => a.startOnTimeline - b.startOnTimeline);
    const next = sameTrack.find((c) => c.startOnTimeline >= clip.startOnTimeline + clip.duration - 0.5);
    const prev = sameTrack.filter((c) => c.startOnTimeline + c.duration <= clip.startOnTimeline + 0.5).pop();
    const adjacent = next ?? prev;
    if (!adjacent) return;
    const clipA = (next ? clip : prev)!;
    const clipB = next ?? clip;
    setTransitionMenu({ clipA: clipA.id, clipB: clipB.id, x: e.clientX, y: e.clientY });
  }, [clips]);

  /* ── playhead position ─── */
  const playheadX = currentTime * pps - scrollLeft;

  /* ── playhead click ─── */
  const handleTrackAreaClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget || (e.target as HTMLElement).dataset.trackbg) {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left + (tracksRef.current?.scrollLeft ?? 0);
      setCurrentTime(Math.max(0, x / pps));
      deselectAll();
    }
  }, [pps, setCurrentTime, selectClip, selectText]);

  return (
    <div className="flex flex-col bg-surface border-t border-white/5 select-none" style={{ minHeight: 200 }}>
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 py-1 border-b border-white/5 bg-surface-50">
        <button onClick={handleAddText} className="flex items-center gap-1 px-2 py-1 rounded bg-amber-500/20 text-amber-300 text-xs hover:bg-amber-500/30 transition-colors" title={`${t('addText')} (T)`}>
          <Type size={13} /> {t('addText')}
        </button>
        <button onClick={handleSplit} disabled={selectedClipIds.size === 0} className="flex items-center gap-1 px-2 py-1 rounded bg-white/5 text-gray-300 text-xs hover:bg-white/10 transition-colors disabled:opacity-30" title={`${t('split')} (S)`}>
          <Scissors size={13} /> {t('split')}
        </button>
        <button onClick={() => { selectedClipIds.forEach((id) => removeClip(id)); if (selectedTextId) removeTextItem(selectedTextId); }}
          disabled={selectedClipIds.size === 0 && !selectedTextId}
          className="flex items-center gap-1 px-2 py-1 rounded bg-white/5 text-gray-300 text-xs hover:bg-white/10 transition-colors disabled:opacity-30" title={`${t('delete')} (Del)`}>
          <Trash2 size={13} /> {t('delete')}
        </button>

        {/* Add track dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowAddTrack((v) => !v)}
            className="flex items-center gap-1 px-2 py-1 rounded bg-white/5 text-gray-300 text-xs hover:bg-white/10 transition-colors"
            title={t('addTrack')}
          >
            <Plus size={13} /> {t('addTrack')} <ChevronDown size={11} className="opacity-60" />
          </button>
          {showAddTrack && (
            <div className="absolute top-full left-0 mt-1 z-50 bg-surface-100 border border-white/10 rounded-lg shadow-xl overflow-hidden min-w-[130px]"
              onMouseLeave={() => setShowAddTrack(false)}>
              <button onClick={() => { addTrack('video'); setShowAddTrack(false); }}
                className="flex items-center gap-2 w-full px-3 py-2 text-xs text-gray-200 hover:bg-white/10 transition-colors">
                <Film size={13} className="text-accent" /> {t('trackVideo')}
              </button>
              <button onClick={() => { addTrack('audio'); setShowAddTrack(false); }}
                className="flex items-center gap-2 w-full px-3 py-2 text-xs text-gray-200 hover:bg-white/10 transition-colors">
                <Music size={13} className="text-green-400" /> {t('trackAudio')}
              </button>
              <button onClick={() => { addTrack('text'); setShowAddTrack(false); }}
                className="flex items-center gap-2 w-full px-3 py-2 text-xs text-gray-200 hover:bg-white/10 transition-colors">
                <Type size={13} className="text-amber-400" /> {t('trackText')}
              </button>
            </div>
          )}
        </div>

        <div className="flex-1" />
        <button onClick={() => zoom(-10)} className="p-1 text-gray-400 hover:text-white" title="-"><Minus size={14} /></button>
        <span className="text-[10px] text-gray-500 w-12 text-center">{pps.toFixed(0)} px/s</span>
        <button onClick={() => zoom(10)} className="p-1 text-gray-400 hover:text-white" title="+"><ZoomIn size={14} /></button>
      </div>

      {/* Ruler + Tracks area */}
      <div className="flex flex-1 overflow-hidden" ref={containerRef}>
        {/* Track headers */}
        <div className="w-36 flex-shrink-0 bg-surface-100 border-r border-white/5 flex flex-col">
          <div style={{ height: RULER_H }} className="border-b border-white/5" />
          {tracks.map((track, idx) => (
            <TrackHeader
              key={track.id}
              track={track}
              updateTrack={updateTrack}
              h={track.kind === 'text' ? TEXT_TRACK_H : TRACK_H}
              index={idx}
              isDragOver={dropTrackIdx === idx}
              onDragStart={() => setDragTrackIdx(idx)}
              onDragOver={(i) => setDropTrackIdx(i)}
              onDrop={() => {
                if (dragTrackIdx !== null && dragTrackIdx !== idx) {
                  reorderTracks(dragTrackIdx, idx);
                }
                setDragTrackIdx(null);
                setDropTrackIdx(null);
              }}
              onDragEnd={() => { setDragTrackIdx(null); setDropTrackIdx(null); }}
            />
          ))}
        </div>

        {/* Scrollable timeline area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Ruler */}
          <div className="relative flex-shrink-0 border-b border-white/5" style={{ height: RULER_H }}>
            <Ruler totalDur={dur} pps={pps} scrollLeft={scrollLeft} />
            <canvas className="absolute inset-0 w-full h-full pointer-events-auto cursor-pointer" style={{ height: RULER_H }} onClick={handleRulerClick} />
            {/* playhead top marker */}
            {playheadX >= 0 && (
              <div className="absolute top-0 pointer-events-none" style={{ left: playheadX, height: RULER_H }}>
                <div className="w-3 h-3 bg-red-500 -translate-x-1/2" style={{ clipPath: 'polygon(0 0,100% 0,50% 100%)' }} />
              </div>
            )}
          </div>

          {/* Tracks area */}
          <div ref={tracksRef} className="flex-1 overflow-x-auto overflow-y-auto relative" onScroll={handleScroll} onClick={handleTrackAreaClick}>
            <div className="relative" style={{ width: timelineW, minHeight: '100%' }}>
              {tracks.map((track) => {
                const h = track.kind === 'text' ? TEXT_TRACK_H : TRACK_H;
                const trackClips = clips.filter((c) => c.trackId === track.id);
                const trackTexts = textItems.filter((t) => t.trackId === track.id);
                const trackTransitions = transitions.filter((tr) => {
                  const a = clips.find((c) => c.id === tr.clipAId);
                  return a && a.trackId === track.id;
                });

                return (
                  <div key={track.id}
                    data-trackbg="1"
                    className="relative border-b border-white/5 group"
                    style={{ height: h }}
                    onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
                    onDrop={(e) => handleDrop(e, track.id)}>
                    {/* clip blocks */}
                    {trackClips.map((clip) => (
                      <ClipBlock key={clip.id} clip={clip} track={track} pps={pps} h={h}
                        selected={selectedClipIds.has(clip.id)}
                        mediaName={mediaMap.get(clip.mediaId)?.name ?? ''}
                        filmstrip={mediaMap.get(clip.mediaId)?.filmstrip}
                        onStartDrag={startDrag}
                        onContextMenu={handleClipContextMenu} />
                    ))}
                    {/* text blocks */}
                    {trackTexts.map((ti) => (
                      <TextBlock key={ti.id} item={ti} pps={pps} h={h}
                        selected={selectedTextId === ti.id}
                        track={track}
                        onStartDrag={startDrag} />
                    ))}
                    {/* transition indicators */}
                    {trackTransitions.map((tr) => (
                      <TransitionIndicator key={tr.id} tr={tr} clips={clips} pps={pps} h={h} />
                    ))}
                  </div>
                );
              })}

              {/* playhead line */}
              {playheadX >= 0 && (
                <div className="absolute top-0 bottom-0 w-px bg-red-500 pointer-events-none z-30" style={{ left: currentTime * pps }} />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* transition context menu */}
      {transitionMenu && (
        <TransitionMenu
          x={transitionMenu.x} y={transitionMenu.y}
          onSelect={(type) => {
            addTransition(transitionMenu.clipA, transitionMenu.clipB, type, 0.5);
            setTransitionMenu(null);
          }}
          onClose={() => setTransitionMenu(null)} />
      )}
    </div>
  );
}

/* ── Clip Block ───────────────────────────────────────────── */
const ClipBlock = memo(function ClipBlock({ clip, track, pps, h, selected, mediaName, filmstrip, onStartDrag, onContextMenu }: {
  clip: Clip; track: Track; pps: number; h: number; selected: boolean; mediaName: string; filmstrip?: string[];
  onStartDrag: (e: React.MouseEvent, id: string, mode: 'move' | 'trimL' | 'trimR', isText: boolean) => void;
  onContextMenu: (e: React.MouseEvent, clipId: string) => void;
}) {
  const left = clip.startOnTimeline * pps;
  const width = Math.max(clip.duration * pps, 4);
  const bg = TRACK_COLORS[track.kind] ?? 'bg-gray-500/70';
  const border = TRACK_BORDER_COLORS[track.kind] ?? 'border-gray-500';
  const bgImage = filmstrip?.[0];
  const dimmed = !track.visible || track.muted;

  return (
    <div
      className={`absolute top-1 bottom-1 rounded overflow-hidden cursor-grab active:cursor-grabbing border ${border} ${selected ? 'ring-2 ring-white/60 z-20' : 'z-10'} ${dimmed ? 'opacity-40' : ''} ${track.locked ? 'cursor-not-allowed' : ''} transition-shadow`}
      style={{ left, width }}
      onContextMenu={(e) => onContextMenu(e, clip.id)}
      onMouseDown={(e) => {
        if (e.button !== 0) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const relX = e.clientX - rect.left;
        if (relX < HANDLE_W) onStartDrag(e, clip.id, 'trimL', false);
        else if (relX > rect.width - HANDLE_W) onStartDrag(e, clip.id, 'trimR', false);
        else onStartDrag(e, clip.id, 'move', false);
      }}
    >
      {/* filmstrip background */}
      {bgImage && (
        <div className="absolute inset-0 opacity-50" style={{
          backgroundImage: `url(${bgImage})`, backgroundSize: `auto ${h - 4}px`, backgroundRepeat: 'repeat-x',
        }} />
      )}
      {/* colour overlay */}
      <div className={`absolute inset-0 ${bg}`} />

      {/* label */}
      <div className="relative z-10 px-1.5 py-0.5 flex items-center gap-1 h-full">
        {track.kind === 'audio' ? <Music size={10} className="flex-shrink-0 text-white/80" /> : <Film size={10} className="flex-shrink-0 text-white/80" />}
        <span className="text-[10px] text-white/90 truncate">{mediaName}</span>
        {clip.speed !== 1 && <span className="text-[9px] text-white/60 flex-shrink-0">{clip.speed}×</span>}
        {clip.volume === 0 && <VolumeX size={10} className="flex-shrink-0 text-red-300/80" />}
      </div>

      {/* fade indicators */}
      {clip.fadeIn > 0 && (
        <div className="absolute left-0 top-0 bottom-0 pointer-events-none" style={{ width: clip.fadeIn * pps }}>
          <div className="w-full h-full bg-gradient-to-r from-black/50 to-transparent" />
        </div>
      )}
      {clip.fadeOut > 0 && (
        <div className="absolute right-0 top-0 bottom-0 pointer-events-none" style={{ width: clip.fadeOut * pps }}>
          <div className="w-full h-full bg-gradient-to-l from-black/50 to-transparent" />
        </div>
      )}

      {/* trim handles */}
      <div className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-white/30 z-20" />
      <div className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-white/30 z-20" />
    </div>
  );
});

/* ── Text Block ───────────────────────────────────────────── */
const TextBlock = memo(function TextBlock({ item, pps, h, selected, track, onStartDrag }: {
  item: TextItem; pps: number; h: number; selected: boolean; track?: Track;
  onStartDrag: (e: React.MouseEvent, id: string, mode: 'move' | 'trimL' | 'trimR', isText: boolean) => void;
}) {
  const left = item.startOnTimeline * pps;
  const width = Math.max(item.duration * pps, 4);
  const dimmed = track && !track.visible;

  return (
    <div
      className={`absolute top-1 bottom-1 rounded bg-amber-400/50 border border-amber-400 overflow-hidden cursor-grab active:cursor-grabbing ${selected ? 'ring-2 ring-white/60 z-20' : 'z-10'} ${dimmed ? 'opacity-40' : ''} ${track?.locked ? 'cursor-not-allowed' : ''} transition-shadow`}
      style={{ left, width }}
      onMouseDown={(e) => {
        if (e.button !== 0) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const relX = e.clientX - rect.left;
        if (relX < HANDLE_W) onStartDrag(e, item.id, 'trimL', true);
        else if (relX > rect.width - HANDLE_W) onStartDrag(e, item.id, 'trimR', true);
        else onStartDrag(e, item.id, 'move', true);
      }}
    >
      <div className="relative z-10 px-1.5 py-0.5 flex items-center gap-1 h-full">
        <Type size={10} className="flex-shrink-0 text-white/80" />
        <span className="text-[10px] text-white/90 truncate">{item.text || t('text')}</span>
      </div>
      <div className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-white/30 z-20" />
      <div className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-white/30 z-20" />
    </div>
  );
});

/* ── Transition Indicator ─────────────────────────────────── */
const TransitionIndicator = memo(function TransitionIndicator({ tr, clips, pps, h }: { tr: Transition; clips: Clip[]; pps: number; h: number }) {
  const a = clips.find((c) => c.id === tr.clipAId);
  const b = clips.find((c) => c.id === tr.clipBId);
  if (!a || !b) return null;
  const start = Math.max(a.startOnTimeline + a.duration - tr.duration, b.startOnTimeline);
  const w = tr.duration * pps;
  return (
    <div className="absolute top-0 bottom-0 bg-white/10 border-x border-white/20 flex items-center justify-center z-15 pointer-events-none" style={{ left: start * pps, width: w }}>
      <span className="text-[8px] text-white/50 uppercase tracking-wider">{tr.type}</span>
    </div>
  );
});

/* ── Track Header ─────────────────────────────────────────── */
const TrackHeader = memo(function TrackHeader({
  track, updateTrack, h, index, isDragOver, onDragStart, onDragOver, onDrop, onDragEnd,
}: {
  track: Track;
  updateTrack: (id: string, p: Partial<Track>) => void;
  h: number;
  index: number;
  isDragOver: boolean;
  onDragStart: () => void;
  onDragOver: (i: number) => void;
  onDrop: () => void;
  onDragEnd: () => void;
}) {
  useLang(); // re-render on language change
  const iconColor = track.kind === 'video' ? 'text-accent-light' : track.kind === 'audio' ? 'text-green-400' : 'text-amber-400';
  const displayName = track.name.replace(
    /^(Video|Audio|Text)(\s+\d+)?$/,
    (_, word, num) => `${t(word === 'Video' ? 'trackVideo' : word === 'Audio' ? 'trackAudio' : 'trackText')}${num ?? ''}`,
  );
  return (
    <div
      draggable
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; onDragStart(); }}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; onDragOver(index); }}
      onDrop={(e) => { e.preventDefault(); onDrop(); }}
      onDragEnd={onDragEnd}
      className={`flex items-center gap-1 px-1 border-b border-white/5 text-xs text-gray-400 bg-surface-100 hover:bg-surface-200 transition-colors cursor-grab active:cursor-grabbing ${isDragOver ? 'ring-1 ring-inset ring-accent/60 bg-accent/10' : ''}`}
      style={{ height: h }}
    >
      <span className={`mr-0.5 opacity-30 hover:opacity-70 cursor-grab`}>⠿</span>
      {track.kind === 'video' && <Film size={12} className={iconColor} />}
      {track.kind === 'audio' && <Music size={12} className={iconColor} />}
      {track.kind === 'text' && <Type size={12} className={iconColor} />}
      <span className="truncate flex-1 text-gray-300">{displayName}</span>
      <button onClick={() => updateTrack(track.id, { muted: !track.muted })} className="p-0.5 hover:text-white" title={track.muted ? t('unmuteTrack') : t('muteTrack')}>
        {track.muted ? <VolumeX size={11} className="text-red-400" /> : <Volume2 size={11} />}
      </button>
      <button onClick={() => updateTrack(track.id, { locked: !track.locked })} className="p-0.5 hover:text-white" title={track.locked ? t('unlockTrack') : t('lockTrack')}>
        {track.locked ? <Lock size={11} className="text-yellow-400" /> : <Unlock size={11} />}
      </button>
      {track.kind !== 'audio' && (
        <button onClick={() => updateTrack(track.id, { visible: !track.visible })} className="p-0.5 hover:text-white" title={track.visible ? t('hideTrack') : t('showTrack')}>
          {track.visible ? <Eye size={11} /> : <EyeOff size={11} className="text-gray-600" />}
        </button>
      )}
    </div>
  );
});

/* ── Transition context menu ──────────────────────────────── */
const TransitionMenu = memo(function TransitionMenu({ x, y, onSelect, onClose }: { x: number; y: number; onSelect: (t: TransitionType) => void; onClose: () => void }) {
  const types: TransitionType[] = ['crossfade', 'fade-black', 'fade-white', 'dissolve', 'wipe-left', 'wipe-right', 'wipe-up', 'wipe-down', 'slide-left', 'slide-right'];
  useEffect(() => {
    const h = () => onClose();
    window.addEventListener('click', h);
    return () => window.removeEventListener('click', h);
  }, [onClose]);

  return (
    <div className="fixed z-50 bg-surface-100 border border-white/10 rounded shadow-xl py-1 text-xs" style={{ left: x, top: y }}>
      {types.map((t) => (
        <button key={t} onClick={() => onSelect(t)} className="block w-full text-left px-3 py-1.5 text-gray-300 hover:bg-accent/30 hover:text-white">
          {t}
        </button>
      ))}
    </div>
  );
});
