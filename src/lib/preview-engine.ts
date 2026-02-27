/**
 * Preview Engine — real-time canvas playback for the NLE timeline.
 */
import type { Clip, Track, MediaFile, ClipEffects, TextItem, Transition } from '../types';

interface ActiveSource {
  clipId: string;
  mediaId: string;
  element: HTMLVideoElement | HTMLAudioElement | HTMLImageElement;
  mediaType: 'video' | 'audio' | 'image';
  clip: Clip;
  trackVolume: number;
  trackMuted: boolean;
}

function buildCssFilter(fx?: ClipEffects): string {
  if (!fx) return 'none';
  const parts: string[] = [];
  if (fx.brightness != null && fx.brightness !== 1) parts.push(`brightness(${fx.brightness})`);
  if (fx.contrast != null && fx.contrast !== 1) parts.push(`contrast(${fx.contrast})`);
  if (fx.saturation != null && fx.saturation !== 1) parts.push(`saturate(${fx.saturation})`);
  if (fx.blur != null && fx.blur > 0) parts.push(`blur(${fx.blur}px)`);
  if (fx.grayscale != null && fx.grayscale > 0) parts.push(`grayscale(${fx.grayscale})`);
  if (fx.sepia != null && fx.sepia > 0) parts.push(`sepia(${fx.sepia})`);
  if (fx.hueRotate != null && fx.hueRotate !== 0) parts.push(`hue-rotate(${fx.hueRotate}deg)`);
  if (fx.invert != null && fx.invert > 0) parts.push(`invert(${fx.invert})`);
  return parts.length > 0 ? parts.join(' ') : 'none';
}

export class PreviewEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private sources: Map<string, ActiveSource> = new Map();
  private preloadedElements: Map<string, HTMLVideoElement | HTMLAudioElement> = new Map(); // clipId → element
  private imageCache: Map<string, HTMLImageElement> = new Map();
  private animFrameId: number | null = null;
  private _playing = false;
  private _currentTime = 0;
  private _startWallTime = 0;
  private width: number;
  private height: number;
  private onTimeUpdate?: (time: number) => void;
  private onEnded?: () => void;

  private _clips: Clip[] = [];
  private _tracks: Track[] = [];
  private _mediaMap: Map<string, MediaFile> = new Map();
  private _textItems: TextItem[] = [];
  private _transitions: Transition[] = [];
  private _totalDuration = 0;

  constructor(
    canvas: HTMLCanvasElement,
    width = 1280,
    height = 720,
    onTimeUpdate?: (time: number) => void,
    onEnded?: () => void,
  ) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.width = width;
    this.height = height;
    canvas.width = width;
    canvas.height = height;
    this.onTimeUpdate = onTimeUpdate;
    this.onEnded = onEnded;
  }

  get playing() { return this._playing; }
  get currentTime() { return this._currentTime; }

  private getImage(url: string): HTMLImageElement | null {
    if (this.imageCache.has(url)) {
      const img = this.imageCache.get(url)!;
      return img.complete ? img : null;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = url;
    this.imageCache.set(url, img);
    return img.complete ? img : null;
  }

  prepareSources(clips: Clip[], tracks: Track[], mediaMap: Map<string, MediaFile>, currentTime: number) {
    const PRELOAD_AHEAD = 0.6; // seconds before clip start to begin preloading
    const activeClipIds = new Set<string>();
    const preloadClipIds = new Set<string>();

    for (const clip of clips) {
      const clipEnd = clip.startOnTimeline + clip.duration;
      if (currentTime >= clip.startOnTimeline && currentTime < clipEnd) {
        activeClipIds.add(clip.id);
      } else if (
        this._playing &&
        clip.startOnTimeline > currentTime &&
        clip.startOnTimeline - currentTime <= PRELOAD_AHEAD
      ) {
        preloadClipIds.add(clip.id);
      }
    }

    // Extend active range for clips involved in transitions
    // so both clips are loaded during the transition zone
    for (const tr of this._transitions) {
      const clipA = clips.find((c) => c.id === tr.clipAId);
      const clipB = clips.find((c) => c.id === tr.clipBId);
      if (!clipA || !clipB) continue;
      const aEnd = clipA.startOnTimeline + clipA.duration;
      const trStart = Math.max(clipB.startOnTimeline, aEnd - tr.duration);
      const trEnd = Math.min(aEnd, clipB.startOnTimeline + tr.duration);
      if (currentTime >= trStart && currentTime < trEnd) {
        activeClipIds.add(clipA.id);
        activeClipIds.add(clipB.id);
      }
    }

    // Clean up sources that are no longer active
    for (const [clipId, src] of this.sources) {
      if (!activeClipIds.has(clipId)) {
        if (src.element instanceof HTMLVideoElement || src.element instanceof HTMLAudioElement) {
          src.element.pause();
          src.element.removeAttribute('src');
          src.element.load();
        }
        this.sources.delete(clipId);
      }
    }

    // Clean up preloaded elements that are no longer needed
    for (const [clipId, el] of this.preloadedElements) {
      if (activeClipIds.has(clipId) || preloadClipIds.has(clipId)) continue;
      el.pause();
      el.removeAttribute('src');
      el.load();
      this.preloadedElements.delete(clipId);
    }

    for (const clip of clips) {
      if (!activeClipIds.has(clip.id)) continue;

      const media = mediaMap.get(clip.mediaId);
      if (!media) continue;

      const track = tracks.find((t) => t.id === clip.trackId);
      if (!track) continue;
      // For video/image tracks: skip if not visible
      // For audio tracks: skip only if muted (audio has no visual component)
      if (media.type !== 'audio' && !track.visible) continue;
      if (media.type === 'audio' && track.muted) continue;

      // If source already exists, update its clip snapshot + live audio params
      const existing = this.sources.get(clip.id);
      if (existing) {
        existing.clip = clip;
        existing.trackVolume = track.volume;
        existing.trackMuted = track.muted;
        if (existing.element instanceof HTMLVideoElement || existing.element instanceof HTMLAudioElement) {
          const isMuted = track.muted || clip.volume === 0;
          existing.element.muted = isMuted;
          if (!isMuted) existing.element.volume = Math.min(1, clip.volume * track.volume);
          existing.element.playbackRate = clip.speed;
        }
        continue;
      }

      let element: HTMLVideoElement | HTMLAudioElement | HTMLImageElement;

      if (media.type === 'video') {
        // Reuse preloaded element if available (already seeked to sourceStart)
        const preloaded = this.preloadedElements.get(clip.id);
        if (preloaded) {
          this.preloadedElements.delete(clip.id);
          element = preloaded;
          const elapsed = currentTime - clip.startOnTimeline;
          (element as HTMLVideoElement).currentTime = clip.sourceStart + elapsed * clip.speed;
        } else {
          element = document.createElement('video');
          (element as HTMLVideoElement).playsInline = true;
          (element as HTMLVideoElement).src = media.url;
          (element as HTMLVideoElement).preload = 'auto';
          const elapsed = currentTime - clip.startOnTimeline;
          (element as HTMLVideoElement).currentTime = clip.sourceStart + elapsed * clip.speed;
        }
        (element as HTMLVideoElement).muted = track.muted || clip.volume === 0;
        (element as HTMLVideoElement).volume = Math.min(1, clip.volume * track.volume);
        (element as HTMLVideoElement).playbackRate = clip.speed;
      } else if (media.type === 'audio') {
        const preloaded = this.preloadedElements.get(clip.id);
        if (preloaded) {
          this.preloadedElements.delete(clip.id);
          element = preloaded;
          const elapsed = currentTime - clip.startOnTimeline;
          element.currentTime = clip.sourceStart + elapsed * clip.speed;
        } else {
          element = document.createElement('audio');
          element.src = media.url;
          element.preload = 'auto';
          const elapsed = currentTime - clip.startOnTimeline;
          element.currentTime = clip.sourceStart + elapsed * clip.speed;
        }
        (element as HTMLAudioElement).muted = track.muted || clip.volume === 0;
        (element as HTMLAudioElement).volume = Math.min(1, clip.volume * track.volume);
        (element as HTMLAudioElement).playbackRate = clip.speed;
      } else {
        const img = this.getImage(media.url);
        element = img ?? new Image();
        if (!img) {
          const newImg = new Image();
          newImg.crossOrigin = 'anonymous';
          newImg.src = media.url;
          this.imageCache.set(media.url, newImg);
          element = newImg;
        }
      }

      this.sources.set(clip.id, {
        clipId: clip.id, mediaId: clip.mediaId, element,
        mediaType: media.type, clip,
        trackVolume: track.volume, trackMuted: track.muted,
      });
    }

    // ── Preload upcoming clips so they're ready when they start ──
    for (const clip of clips) {
      if (!preloadClipIds.has(clip.id)) continue;
      if (this.preloadedElements.has(clip.id)) continue; // already preloading
      const media = mediaMap.get(clip.mediaId);
      if (!media || (media.type !== 'video' && media.type !== 'audio')) continue;
      const track = tracks.find((t) => t.id === clip.trackId);
      if (!track) continue;

      let el: HTMLVideoElement | HTMLAudioElement;
      if (media.type === 'video') {
        el = document.createElement('video');
        (el as HTMLVideoElement).playsInline = true;
        el.preload = 'auto';
        el.src = media.url;
        el.muted = true; // mute while preloading to avoid audio bleed
        el.currentTime = clip.sourceStart;
      } else {
        el = document.createElement('audio');
        el.preload = 'auto';
        el.src = media.url;
        el.muted = true;
        el.currentTime = clip.sourceStart;
      }
      this.preloadedElements.set(clip.id, el);
    }
  }

  seek(time: number, clips: Clip[], tracks: Track[], mediaMap: Map<string, MediaFile>, textItems?: TextItem[]) {
    this._currentTime = Math.max(0, time);
    if (textItems) this._textItems = textItems;
    // Discard preloaded elements on manual seek — they were seeked to old sourceStart positions
    for (const [, el] of this.preloadedElements) {
      el.pause();
      el.removeAttribute('src');
      el.load();
    }
    this.preloadedElements.clear();
    this.prepareSources(clips, tracks, mediaMap, this._currentTime);

    if (this._playing) {
      this._startWallTime = performance.now() - this._currentTime * 1000;
      this._clips = clips;
      this._tracks = tracks;
      this._mediaMap = mediaMap;
    }

    for (const [, src] of this.sources) {
      if (src.element instanceof HTMLVideoElement || src.element instanceof HTMLAudioElement) {
        const elapsed = this._currentTime - src.clip.startOnTimeline;
        src.element.currentTime = src.clip.sourceStart + elapsed * src.clip.speed;
        if (this._playing && src.element.paused) src.element.play().catch(() => {});
      }
    }

    this.renderFrame();
    this.onTimeUpdate?.(this._currentTime);
  }

  play(clips: Clip[], tracks: Track[], mediaMap: Map<string, MediaFile>, totalDuration: number, textItems?: TextItem[]) {
    if (this._playing) return;
    this._playing = true;
    this._startWallTime = performance.now() - this._currentTime * 1000;
    this._clips = clips;
    this._tracks = tracks;
    this._mediaMap = mediaMap;
    this._totalDuration = totalDuration;
    if (textItems) this._textItems = textItems;

    this.prepareSources(clips, tracks, mediaMap, this._currentTime);

    for (const [, src] of this.sources) {
      if (src.element instanceof HTMLVideoElement || src.element instanceof HTMLAudioElement) {
        src.element.play().catch(() => {});
      }
    }

    const loop = () => {
      if (!this._playing) return;
      const now = performance.now();
      this._currentTime = (now - this._startWallTime) / 1000;

      if (this._currentTime >= this._totalDuration) {
        this.pause();
        this._currentTime = this._totalDuration;
        this.onTimeUpdate?.(this._currentTime);
        this.onEnded?.();
        return;
      }

      this.prepareSources(this._clips, this._tracks, this._mediaMap, this._currentTime);

      for (const [, src] of this.sources) {
        if ((src.element instanceof HTMLVideoElement || src.element instanceof HTMLAudioElement) && src.element.paused) {
          const elapsed = this._currentTime - src.clip.startOnTimeline;
          src.element.currentTime = src.clip.sourceStart + elapsed * src.clip.speed;
          src.element.play().catch(() => {});
        }
      }

      this.renderFrame();
      this.onTimeUpdate?.(this._currentTime);
      this.animFrameId = requestAnimationFrame(loop);
    };

    this.animFrameId = requestAnimationFrame(loop);
  }

  pause() {
    this._playing = false;
    if (this.animFrameId !== null) { cancelAnimationFrame(this.animFrameId); this.animFrameId = null; }
    for (const [, src] of this.sources) {
      if (src.element instanceof HTMLVideoElement || src.element instanceof HTMLAudioElement) src.element.pause();
    }
  }

  setTextItems(items: TextItem[]) { this._textItems = items; }
  setTransitions(transitions: Transition[]) { this._transitions = transitions; }

  /** Hot-update clips/tracks/media while playing — applies volume/mute changes instantly without seeking */
  updateLiveData(clips: Clip[], tracks: Track[], mediaMap: Map<string, MediaFile>, transitions?: Transition[]) {
    this._clips = clips;
    this._tracks = tracks;
    this._mediaMap = mediaMap;
    if (transitions) this._transitions = transitions;
    // Re-run prepareSources so new clips get elements and existing ones get updated clip snapshots
    this.prepareSources(clips, tracks, mediaMap, this._currentTime);
  }

  private calcFadeOpacity(start: number, dur: number, fadeIn: number, fadeOut: number): number {
    const elapsed = this._currentTime - start;
    let o = 1;
    if (fadeIn > 0 && elapsed < fadeIn) o = elapsed / fadeIn;
    if (fadeOut > 0 && elapsed > dur - fadeOut) o = (dur - elapsed) / fadeOut;
    return Math.max(0, Math.min(1, o));
  }

  private renderFrame() {
    const ctx = this.ctx;
    const t = this._currentTime;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.width, this.height);

    // ── 1. Collect active visual sources, handle audio ──
    const visualSources: ActiveSource[] = [];
    for (const [, src] of this.sources) {
      const track = this._tracks.find((tr) => tr.id === src.clip.trackId);

      // audio volume/mute
      if (src.element instanceof HTMLVideoElement || src.element instanceof HTMLAudioElement) {
        const isMuted = (track?.muted ?? false) || src.clip.volume === 0;
        src.element.muted = isMuted;
        if (!isMuted) src.element.volume = Math.min(1, src.clip.volume * (track?.volume ?? 1));
      }

      if (track && !track.visible) continue;
      if (src.mediaType === 'video' || src.mediaType === 'image') visualSources.push(src);
    }

    // ── 2. Sort by track z-order (tracks[0] = topmost → drawn last) ──
    const trackIndex = new Map(this._tracks.map((tr, i) => [tr.id, i]));
    visualSources.sort((a, b) => {
      const ia = trackIndex.get(a.clip.trackId) ?? 999;
      const ib = trackIndex.get(b.clip.trackId) ?? 999;
      if (ia !== ib) return ib - ia; // higher index (bottom track) drawn first
      return a.clip.startOnTimeline - b.clip.startOnTimeline;
    });

    // ── 3. Group by track — pick which clip(s) to show per track ──
    // For each video track: show at most one clip, or two if they have a transition
    const byTrack = new Map<string, ActiveSource[]>();
    for (const src of visualSources) {
      const tid = src.clip.trackId;
      if (!byTrack.has(tid)) byTrack.set(tid, []);
      byTrack.get(tid)!.push(src);
    }

    // Draw tracks from bottom to top (reverse track order)
    const orderedTrackIds = [...byTrack.keys()].sort((a, b) =>
      (trackIndex.get(b) ?? 999) - (trackIndex.get(a) ?? 999)
    );

    for (const tid of orderedTrackIds) {
      const srcs = byTrack.get(tid)!;
      // Sort clips on this track by timeline position
      srcs.sort((a, b) => a.clip.startOnTimeline - b.clip.startOnTimeline);

      if (srcs.length === 1) {
        this.drawSource(ctx, srcs[0], 1);
        continue;
      }

      // Multiple clips on the same track at the same time — check for transitions
      for (let i = 0; i < srcs.length; i++) {
        const src = srcs[i];
        const next = srcs[i + 1];

        // Check if there's a transition between src and next
        if (next) {
          const tr = this._transitions.find((tr) =>
            (tr.clipAId === src.clip.id && tr.clipBId === next.clip.id) ||
            (tr.clipAId === next.clip.id && tr.clipBId === src.clip.id)
          );
          if (tr) {
            // Draw the transition between src (outgoing A) and next (incoming B)
            const clipA = tr.clipAId === src.clip.id ? src : next;
            const clipB = tr.clipBId === next.clip.id ? next : src;
            this.drawTransition(ctx, clipA, clipB, tr);
            i++; // skip next, already drawn as part of transition
            continue;
          }
        }

        // No transition — just draw the clip normally (top clip wins via draw order)
        this.drawSource(ctx, src, 1);
      }
    }

    this.renderTextOverlays(ctx);
  }

  /** Draw a single source onto the canvas with given extra opacity multiplier */
  private drawSource(ctx: CanvasRenderingContext2D, src: ActiveSource, extraAlpha: number) {
    const fadeAlpha = this.calcFadeOpacity(src.clip.startOnTimeline, src.clip.duration, src.clip.fadeIn, src.clip.fadeOut);
    const effectOpacity = src.clip.effects?.opacity ?? 1;
    const alpha = fadeAlpha * effectOpacity * extraAlpha;
    if (alpha <= 0) return;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.filter = buildCssFilter(src.clip.effects);

    if (src.mediaType === 'video') {
      const vid = src.element as HTMLVideoElement;
      if (vid.readyState >= 2) {
        const vw = vid.videoWidth || this.width;
        const vh = vid.videoHeight || this.height;
        const scale = Math.min(this.width / vw, this.height / vh);
        const dw = vw * scale, dh = vh * scale;
        ctx.drawImage(vid, (this.width - dw) / 2, (this.height - dh) / 2, dw, dh);
      }
    } else if (src.mediaType === 'image') {
      const img = src.element as HTMLImageElement;
      if (img.complete && img.naturalWidth) {
        const vw = img.naturalWidth, vh = img.naturalHeight;
        const scale = Math.min(this.width / vw, this.height / vh);
        const dw = vw * scale, dh = vh * scale;
        ctx.drawImage(img, (this.width - dw) / 2, (this.height - dh) / 2, dw, dh);
      }
    }

    ctx.restore();
  }

  /** Draw a transition between two clips */
  private drawTransition(ctx: CanvasRenderingContext2D, srcA: ActiveSource, srcB: ActiveSource, tr: Transition) {
    // Transition region: overlap between clipA end and clipB start
    const aEnd = srcA.clip.startOnTimeline + srcA.clip.duration;
    const bStart = srcB.clip.startOnTimeline;
    const trStart = Math.max(bStart, aEnd - tr.duration);
    const trEnd = Math.min(aEnd, bStart + tr.duration);
    const trDuration = trEnd - trStart;

    const t = this._currentTime;

    if (t < trStart || trDuration <= 0) {
      // Before transition region — just draw whichever is active
      if (t < bStart) this.drawSource(ctx, srcA, 1);
      else this.drawSource(ctx, srcB, 1);
      return;
    }
    if (t >= trEnd) {
      this.drawSource(ctx, srcB, 1);
      return;
    }

    // progress 0→1 through the transition
    const progress = (t - trStart) / trDuration;

    switch (tr.type) {
      case 'crossfade':
      case 'dissolve':
        // A fades out, B fades in
        this.drawSource(ctx, srcA, 1 - progress);
        this.drawSource(ctx, srcB, progress);
        break;

      case 'fade-black':
        // A fades to black, then B fades in from black
        if (progress < 0.5) {
          this.drawSource(ctx, srcA, 1 - progress * 2);
        } else {
          this.drawSource(ctx, srcB, (progress - 0.5) * 2);
        }
        break;

      case 'fade-white':
        // A fades to white, then B fades in from white
        if (progress < 0.5) {
          this.drawSource(ctx, srcA, 1);
          ctx.save();
          ctx.globalAlpha = progress * 2;
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, this.width, this.height);
          ctx.restore();
        } else {
          ctx.save();
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, this.width, this.height);
          ctx.restore();
          this.drawSource(ctx, srcB, (progress - 0.5) * 2);
        }
        break;

      case 'wipe-left':
        this.drawWipe(ctx, srcA, srcB, progress, 'left');
        break;
      case 'wipe-right':
        this.drawWipe(ctx, srcA, srcB, progress, 'right');
        break;
      case 'wipe-up':
        this.drawWipe(ctx, srcA, srcB, progress, 'up');
        break;
      case 'wipe-down':
        this.drawWipe(ctx, srcA, srcB, progress, 'down');
        break;

      case 'slide-left':
        this.drawSlide(ctx, srcA, srcB, progress, 'left');
        break;
      case 'slide-right':
        this.drawSlide(ctx, srcA, srcB, progress, 'right');
        break;

      default:
        // Unknown — just crossfade
        this.drawSource(ctx, srcA, 1 - progress);
        this.drawSource(ctx, srcB, progress);
        break;
    }
  }

  /** Wipe transition: B is revealed by a moving edge */
  private drawWipe(ctx: CanvasRenderingContext2D, srcA: ActiveSource, srcB: ActiveSource, progress: number, dir: 'left' | 'right' | 'up' | 'down') {
    // Draw A fully
    this.drawSource(ctx, srcA, 1);

    // Clip region for B
    ctx.save();
    ctx.beginPath();
    const w = this.width, h = this.height;
    switch (dir) {
      case 'left':  ctx.rect(w * (1 - progress), 0, w * progress, h); break;  // B reveals from right, edge moves left
      case 'right': ctx.rect(0, 0, w * progress, h); break;                   // B reveals from left, edge moves right
      case 'up':    ctx.rect(0, h * (1 - progress), w, h * progress); break;  // B reveals from bottom, edge moves up
      case 'down':  ctx.rect(0, 0, w, h * progress); break;                   // B reveals from top, edge moves down
    }
    ctx.clip();
    this.drawSource(ctx, srcB, 1);
    ctx.restore();
  }

  /** Slide transition: B slides in pushing A out */
  private drawSlide(ctx: CanvasRenderingContext2D, srcA: ActiveSource, srcB: ActiveSource, progress: number, dir: 'left' | 'right') {
    const w = this.width;
    const offset = w * progress;

    ctx.save();
    if (dir === 'left') {
      ctx.translate(-offset, 0);
    } else {
      ctx.translate(offset, 0);
    }
    this.drawSource(ctx, srcA, 1);
    ctx.restore();

    ctx.save();
    if (dir === 'left') {
      ctx.translate(w - offset, 0);
    } else {
      ctx.translate(-(w - offset), 0);
    }
    this.drawSource(ctx, srcB, 1);
    ctx.restore();
  }

  private renderTextOverlays(ctx: CanvasRenderingContext2D) {
    for (const ti of this._textItems) {
      const end = ti.startOnTimeline + ti.duration;
      if (this._currentTime < ti.startOnTimeline || this._currentTime >= end) continue;

      const track = this._tracks.find((t) => t.id === ti.trackId);
      if (track && !track.visible) continue;

      const opacity = this.calcFadeOpacity(ti.startOnTimeline, ti.duration, ti.fadeIn, ti.fadeOut) * ti.opacity;
      if (opacity <= 0) continue;

      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.font = `${ti.fontWeight} ${ti.fontSize}px ${ti.fontFamily}`;
      ctx.textAlign = ti.textAlign;
      ctx.textBaseline = 'middle';

      const x = ti.x * this.width;
      const y = ti.y * this.height;
      const lines = ti.text.split('\n');
      const lineHeight = ti.fontSize * 1.3;
      const totalH = lines.length * lineHeight;
      const startY = y - totalH / 2 + lineHeight / 2;

      if (ti.backgroundColor) {
        ctx.fillStyle = ti.backgroundColor;
        const maxW = Math.max(...lines.map((l) => ctx.measureText(l).width));
        const pad = ti.fontSize * 0.4;
        let bgX = x - maxW / 2 - pad;
        if (ti.textAlign === 'left') bgX = x - pad;
        else if (ti.textAlign === 'right') bgX = x - maxW - pad;
        ctx.beginPath();
        ctx.roundRect(bgX, startY - lineHeight / 2 - pad / 2, maxW + pad * 2, totalH + pad, ti.fontSize * 0.15);
        ctx.fill();
      }

      if (ti.shadowBlur > 0) {
        ctx.shadowBlur = ti.shadowBlur;
        ctx.shadowColor = ti.shadowColor;
        ctx.shadowOffsetY = 2;
      }

      for (let i = 0; i < lines.length; i++) {
        const ly = startY + i * lineHeight;
        if (ti.strokeWidth > 0) {
          ctx.strokeStyle = ti.strokeColor;
          ctx.lineWidth = ti.strokeWidth;
          ctx.lineJoin = 'round';
          ctx.strokeText(lines[i], x, ly);
        }
        ctx.fillStyle = ti.color;
        ctx.fillText(lines[i], x, ly);
      }

      ctx.restore();
    }
  }

  captureFrame(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      this.renderFrame();
      this.canvas.toBlob(
        (blob) => { if (blob) resolve(blob); else reject(new Error('Capture failed')); },
        'image/png',
      );
    });
  }

  destroy() {
    this.pause();
    for (const [, src] of this.sources) {
      if (src.element instanceof HTMLVideoElement || src.element instanceof HTMLAudioElement) {
        src.element.pause();
        src.element.removeAttribute('src');
        src.element.load();
      }
    }
    this.sources.clear();
    for (const [, el] of this.preloadedElements) {
      el.pause();
      el.removeAttribute('src');
      el.load();
    }
    this.preloadedElements.clear();
    this.imageCache.clear();
  }
}
