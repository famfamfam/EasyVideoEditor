/**
 * Export engine — converts the NLE project state into a final video
 * using FFmpeg.wasm.
 *
 * Pipeline:
 *   1. For each clip: write source → trim / speed / volume / effects → clip_N.mp4
 *   2. Place clips on a timeline using overlay / amix filters
 *   3. Burn text overlays with the drawtext filter
 *   4. Apply transitions between adjacent clips
 *   5. Output final mp4
 *
 * Since FFmpeg.wasm is single-threaded and filter_complex has limits, we use a
 * multi-pass strategy — process each clip individually, then combine.
 */
import { getFFmpeg, resetFFmpeg, type ProgressCallback } from './ffmpeg';
import type { Clip, TextItem, Track, Transition, ExportSettings, ClipEffects } from '../types';

export interface ExportInput {
  clips: Clip[];
  textItems: TextItem[];
  tracks: Track[];
  transitions: Transition[];
  settings: ExportSettings;
  media: Array<{ id: string; url: string; type: string; file?: File; duration?: number }>;
}

/* ────────────────────────────────────────────────────────── */

async function writeMediaToFS(ffmpeg: Awaited<ReturnType<typeof getFFmpeg>>, url: string, filename: string): Promise<void> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const buf = await resp.arrayBuffer();
  await ffmpeg.writeFile(filename, new Uint8Array(buf));
}

function deleteFile(ffmpeg: Awaited<ReturnType<typeof getFFmpeg>>, name: string) {
  try { ffmpeg.deleteFile(name); } catch { /* ok */ }
}

const FONT_REGULAR = 'font_regular.ttf';
const FONT_BOLD = 'font_bold.ttf';

const FONT_SOURCES: { file: string; urls: string[] }[] = [
  {
    file: FONT_REGULAR,
    urls: [
      'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/notosans/NotoSans-Regular.ttf',
      'https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts/unhinted/ttf/NotoSans/NotoSans-Regular.ttf',
      'https://raw.githubusercontent.com/googlefonts/noto-fonts/main/unhinted/ttf/NotoSans/NotoSans-Regular.ttf',
    ],
  },
  {
    file: FONT_BOLD,
    urls: [
      'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/notosans/NotoSans-Bold.ttf',
      'https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts/unhinted/ttf/NotoSans/NotoSans-Bold.ttf',
      'https://raw.githubusercontent.com/googlefonts/noto-fonts/main/unhinted/ttf/NotoSans/NotoSans-Bold.ttf',
    ],
  },
];

const _fontCaches: Record<string, Uint8Array> = {};

async function fetchFontToFS(ffmpeg: Awaited<ReturnType<typeof getFFmpeg>>, filename: string, urls: string[]): Promise<boolean> {
  // Check if already written
  try {
    const existing = await ffmpeg.readFile(filename);
    if (existing instanceof Uint8Array && existing.byteLength > 1000) return true;
  } catch { /* not yet written */ }

  // Use cached font data if available
  if (_fontCaches[filename]) {
    await ffmpeg.writeFile(filename, _fontCaches[filename]);
    return true;
  }

  // Try fetching from CDN
  for (const url of urls) {
    try {
      console.log(`[export] Fetching font ${filename} from ${url}…`);
      const resp = await fetch(url);
      if (!resp.ok) continue;
      const buf = await resp.arrayBuffer();
      if (buf.byteLength < 1000) continue;
      _fontCaches[filename] = new Uint8Array(buf);
      await ffmpeg.writeFile(filename, _fontCaches[filename]);
      console.log(`[export] Font ${filename} loaded (${(buf.byteLength / 1024).toFixed(0)} KB)`);
      return true;
    } catch (e) {
      console.warn(`[export] Font fetch failed:`, e);
    }
  }
  return false;
}

async function ensureFontsInFS(ffmpeg: Awaited<ReturnType<typeof getFFmpeg>>): Promise<boolean> {
  const results = await Promise.all(
    FONT_SOURCES.map((s) => fetchFontToFS(ffmpeg, s.file, s.urls))
  );
  return results.some(Boolean); // at least one font loaded
}

function fontFileForWeight(weight: number): string {
  return weight >= 600 ? FONT_BOLD : FONT_REGULAR;
}

/** Build the -vf string from ClipEffects */
function effectsToFilter(fx?: ClipEffects): string {
  if (!fx) return '';
  const parts: string[] = [];
  const eq: string[] = [];
  if (fx.brightness !== undefined && fx.brightness !== 1) eq.push(`brightness=${(fx.brightness - 1).toFixed(2)}`);
  if (fx.contrast !== undefined && fx.contrast !== 1) eq.push(`contrast=${fx.contrast.toFixed(2)}`);
  if (fx.saturation !== undefined && fx.saturation !== 1) eq.push(`saturation=${fx.saturation.toFixed(2)}`);
  if (eq.length) parts.push(`eq=${eq.join(':')}`);
  if (fx.hueRotate !== undefined && fx.hueRotate !== 0) parts.push(`hue=h=${fx.hueRotate}`);
  if (fx.grayscale !== undefined && fx.grayscale > 0) parts.push(`hue=s=${(1 - fx.grayscale).toFixed(2)}`);
  // sepia approximation: colorchannelmixer
  if (fx.sepia !== undefined && fx.sepia > 0) {
    const s = fx.sepia;
    parts.push(`colorchannelmixer=${(0.393 * s + 1 - s).toFixed(3)}:${(0.769 * s).toFixed(3)}:${(0.189 * s).toFixed(3)}:0:${(0.349 * s).toFixed(3)}:${(0.686 * s + 1 - s).toFixed(3)}:${(0.168 * s).toFixed(3)}:0:${(0.272 * s).toFixed(3)}:${(0.534 * s).toFixed(3)}:${(0.131 * s + 1 - s).toFixed(3)}:0`);
  }
  // opacity is handled at the compositing stage (Step 2) via alpha channel,
  // not here — so we do NOT apply colorchannelmixer here.
  return parts.join(',');
}

/** Build drawtext filter string for a text item (timestamps relative to overlay start) */
function drawtextFilter(t: TextItem, w: number, h: number): string {
  const esc = (s: string) => s.replace(/'/g, "'\\\\\\''").replace(/:/g, '\\:').replace(/\\/g, '\\\\');
  const x = Math.round(t.x * w);
  const y = Math.round(t.y * h);
  const parts = [
    `text='${esc(t.text)}'`,
    `fontsize=${t.fontSize}`,
    `fontcolor=${t.color}`,
    `x=${x}-tw/2`, `y=${y}-th/2`,
  ];
  if (t.fontFamily) parts.push(`font='${esc(t.fontFamily)}'`);
  if (t.strokeWidth > 0) parts.push(`borderw=${t.strokeWidth ?? 0}`, `bordercolor=${t.strokeColor ?? 'black'}`);
  if (t.shadowBlur) parts.push(`shadowx=2`, `shadowy=2`, `shadowcolor=${t.shadowColor ?? 'black'}`);
  if (t.backgroundColor) parts.push(`box=1`, `boxcolor=${t.backgroundColor}@0.6`, `boxborderw=8`);

  // fade alpha
  if (t.fadeIn > 0 || t.fadeOut > 0) {
    let alpha = '1';
    if (t.fadeIn > 0) {
      alpha = `if(lt(t,${t.fadeIn.toFixed(2)}),t/${t.fadeIn.toFixed(2)},1)`;
    }
    if (t.fadeOut > 0) {
      const durSec = t.duration.toFixed(2);
      const fadeStart = (t.duration - t.fadeOut).toFixed(2);
      const fadePart = `if(gt(t,${fadeStart}),(${durSec}-t)/${t.fadeOut.toFixed(2)},1)`;
      alpha = t.fadeIn > 0 ? `min(${alpha},${fadePart})` : fadePart;
    }
    parts.push(`alpha='${alpha}'`);
  }

  // enable only during the text's duration
  parts.push(`enable='between(t,0,${t.duration.toFixed(3)})'`);

  return `drawtext=${parts.join(':')}`;
}

/** Map NLE transition type → FFmpeg xfade transition name */
function xfadeTransition(type: string): string {
  const m: Record<string, string> = {
    'crossfade': 'fade',
    'fade-black': 'fadeblack',
    'fade-white': 'fadewhite',
    'dissolve': 'dissolve',
    'wipe-left': 'wipeleft',
    'wipe-right': 'wiperight',
    'wipe-up': 'wipeup',
    'wipe-down': 'wipedown',
    'slide-left': 'slideleft',
    'slide-right': 'slideright',
  };
  return m[type] ?? 'fade';
}

/**
 * Concatenate two clips on a track, preserving absolute PTS timestamps.
 * When gap > 0, the second clip is delayed by setting its PTS offset.
 * This creates a transparent "hole" in the track that lets lower tracks show through.
 */
async function concatTwoClips(
  ffmpeg: Awaited<ReturnType<typeof getFFmpeg>>,
  fileA: string,
  fileB: string,
  gap: number,
  outFile: string,
  settings: ExportSettings,
  fps: number,
  bStartOffset: number = 0, // absolute timeline start of fileB (0 = immediately after fileA)
): Promise<boolean> {
  const { width, height } = settings;

  // Determine the PTS offset for fileB.
  // If gap <= 0 and bStartOffset == 0, we just concat.
  // Otherwise we use a filter_complex to shift B's PTS.
  const shouldUseFilter = gap > 0.05 || bStartOffset > 0.05;

  if (shouldUseFilter) {
    // Use overlay approach: put fileA and fileB on a shared timeline base
    // without filling the gap with black — the gap remains transparent.
    // Strategy: concat fileA directly, then set fileB's PTS so it starts
    // at the right absolute position. Use setpts + fifo.
    const totalDur = bStartOffset > 0
      ? bStartOffset + 9999 // will be truncated by eof
      : 0;
    const bDelay = gap > 0.05 ? gap : 0;
    const bDelayMs = Math.round(bDelay * 1000);

    if (bDelayMs > 0) {
      // Use concat demuxer with a transparent (silent + black) gap segment
      const gapFile = `gap_${Date.now()}.mp4`;
      await ffmpeg.exec([
        '-f', 'lavfi', '-i', `color=c=black:s=${width}x${height}:d=${bDelay.toFixed(3)}:r=${fps}`,
        '-f', 'lavfi', '-i', `anullsrc=channel_layout=stereo:sample_rate=44100`,
        '-t', bDelay.toFixed(3),
        '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '18', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '128k',
        '-shortest', '-y', gapFile,
      ]);
      const listContent = `file '${fileA}'\nfile '${gapFile}'\nfile '${fileB}'\n`;
      await ffmpeg.writeFile('concat_list.txt', new TextEncoder().encode(listContent));
      const ret = await ffmpeg.exec([
        '-f', 'concat', '-safe', '0', '-i', 'concat_list.txt',
        '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', String(settings.crf ?? 23), '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-ar', '44100',
        '-r', String(fps), '-movflags', '+faststart', '-y', outFile,
      ]);
      deleteFile(ffmpeg, gapFile);
      deleteFile(ffmpeg, 'concat_list.txt');
      let ok = ret === 0;
      if (ok) { try { const d = await ffmpeg.readFile(outFile); ok = d instanceof Uint8Array && d.byteLength > 100; } catch { ok = false; } }
      return ok;
    }
  }

  // No gap — straight concat
  const listContent = `file '${fileA}'\nfile '${fileB}'\n`;
  await ffmpeg.writeFile('concat_list.txt', new TextEncoder().encode(listContent));
  const ret = await ffmpeg.exec([
    '-f', 'concat', '-safe', '0', '-i', 'concat_list.txt',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', String(settings.crf ?? 23), '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-ar', '44100',
    '-r', String(fps), '-movflags', '+faststart', '-y', outFile,
  ]);
  deleteFile(ffmpeg, 'concat_list.txt');
  let ok = ret === 0;
  if (ok) { try { const d = await ffmpeg.readFile(outFile); ok = d instanceof Uint8Array && d.byteLength > 100; } catch { ok = false; } }
  return ok;
}

/* ────────────────────────────────────────────────────────── */

export async function exportProject(input: ExportInput, onProgress?: ProgressCallback): Promise<Blob> {
  const { clips, textItems, tracks, transitions, settings, media } = input;
  if (clips.length === 0 && textItems.length === 0) throw new Error('Нет клипов для экспорта');

  console.log(`[export] exportProject START: clips=${clips.length} tracks=${tracks.length} media=${media.length}`);
  clips.forEach((c, i) => console.log(`  inputClip[${i}] id=${c.id} trackId=${c.trackId} mediaId=${c.mediaId} start=${c.startOnTimeline.toFixed(2)} dur=${c.duration.toFixed(2)} opacity=${c.effects?.opacity}`));
  tracks.forEach((t, i) => console.log(`  track[${i}] id=${t.id} kind=${t.kind} name=${t.name}`));
  media.forEach((m, i) => console.log(`  media[${i}] id=${m.id} type=${m.type} name=${(m as any).name}`));

  onProgress?.(0, 'Запуск видео-движка…');
  const ffmpeg = await getFFmpeg(onProgress);
  const { width, height, fps } = settings;

  /* ── Sort clips by track, then by timeline position ── */
  const videoTracks = tracks.filter((t) => t.kind === 'video');
  const audioTracks = tracks.filter((t) => t.kind === 'audio');
  const sortedVideoClips = clips
    .filter((c) => videoTracks.some((t) => t.id === c.trackId))
    .sort((a, b) => a.startOnTimeline - b.startOnTimeline);
  const sortedAudioClips = clips
    .filter((c) => audioTracks.some((t) => t.id === c.trackId))
    .sort((a, b) => a.startOnTimeline - b.startOnTimeline);
  const allClips = [...sortedVideoClips, ...sortedAudioClips];

  const totalSteps = allClips.length + 3; // +3 for combine, text, finalise
  let step = 0;
  const progress = (msg: string) => {
    step++;
    onProgress?.(Math.min(95, Math.round((step / totalSteps) * 95)), msg);
  };

  /* ── 1. Process each clip individually ─────────────── */
  const processedVideo: { file: string; start: number; duration: number; fileDuration: number; index: number }[] = [];
  const processedAudio: { file: string; start: number; duration: number; fileDuration: number; index: number }[] = [];

  console.log(`[export] Step1: allClips=${allClips.length}, videoTracks=${videoTracks.length}, audioTracks=${audioTracks.length}`);
  allClips.forEach((c, i) => {
    const mf = media.find((m) => m.id === c.mediaId);
    const tr = tracks.find((t) => t.id === c.trackId);
    console.log(`  clip[${i}] id=${c.id} mediaType=${mf?.type} trackKind=${tr?.kind} trackId=${c.trackId} start=${c.startOnTimeline.toFixed(3)} dur=${c.duration.toFixed(3)} srcStart=${c.sourceStart.toFixed(3)} srcEnd=${c.sourceEnd.toFixed(3)} mediaDur=${mf?.duration?.toFixed(3)} opacity=${c.effects?.opacity}`);
  });

  for (let i = 0; i < allClips.length; i++) {
    const clip = allClips[i];
    const mf = media.find((m) => m.id === clip.mediaId);
    if (!mf) { console.warn(`[export] clip[${i}] SKIP: no mediaFile for mediaId=${clip.mediaId}`); continue; }
    const track = tracks.find((t) => t.id === clip.trackId);
    if (!track) { console.warn(`[export] clip[${i}] SKIP: no track for trackId=${clip.trackId}`); continue; }

    // Skip fully transparent clips (opacity = 0)
    if (clip.effects?.opacity !== undefined && clip.effects.opacity <= 0) {
      console.log(`[export] Skipping clip ${i} (opacity=0)`);
      continue;
    }
    const isAudio = track.kind === 'audio' || mf.type === 'audio';

    progress(`Обработка ${isAudio ? 'аудио' : 'видео'} ${i + 1}/${allClips.length}…`);

    // Determine proper file extension for the input
    const isImage = mf.type === 'image';
    const fileName = (mf.file as File | undefined)?.name?.toLowerCase() ?? '';
    const fileType = (mf.file as File | undefined)?.type?.toLowerCase() ?? '';
    let inExt = 'mp4';
    if (fileType.startsWith('audio/') || fileName.endsWith('.mp3')) inExt = fileName.split('.').pop() ?? 'mp3';
    else if (isImage || fileType.startsWith('image/')) {
      if (fileType.includes('png') || fileName.endsWith('.png')) inExt = 'png';
      else if (fileType.includes('webp') || fileName.endsWith('.webp')) inExt = 'webp';
      else if (fileType.includes('gif') || fileName.endsWith('.gif')) inExt = 'gif';
      else if (fileType.includes('bmp') || fileName.endsWith('.bmp')) inExt = 'bmp';
      else inExt = 'jpg';
    } else if (fileName.endsWith('.webm')) inExt = 'webm';
    else if (fileName.endsWith('.avi')) inExt = 'avi';
    else if (fileName.endsWith('.mkv')) inExt = 'mkv';
    const inFile = `in_${i}.${inExt}`;
    const outFile = `proc_${i}.mp4`;
    await writeMediaToFS(ffmpeg, mf.url, inFile);

    const args: string[] = [];
    const trimDur = clip.sourceEnd - clip.sourceStart;
    // Use -ss BEFORE -i for fast seeking; pair with -accurate_seek for frame accuracy.
    // -ss/-t must be input options (before -i) so they apply to the video file,
    // not to a subsequent -i (which would mis-apply them to anullsrc).
    if (clip.sourceStart > 0.05) args.push('-ss', clip.sourceStart.toFixed(3));
    args.push('-i', inFile);
    // silent audio source (no -ss/-t here — unlimited, controlled by output -t below)
    args.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');

    const speed = clip.speed;
    const vol = clip.volume;

    if (isAudio) {
      // audio-only clip
      const aFilters: string[] = [];
      if (speed !== 1) {
        let r = speed;
        while (r > 2) { aFilters.push('atempo=2.0'); r /= 2; }
        while (r < 0.5) { aFilters.push('atempo=0.5'); r /= 0.5; }
        aFilters.push(`atempo=${r.toFixed(4)}`);
      }
      if (vol !== 1) aFilters.push(`volume=${vol.toFixed(2)}`);
      if (clip.fadeIn > 0) aFilters.push(`afade=t=in:st=0:d=${clip.fadeIn.toFixed(2)}`);
      if (clip.fadeOut > 0) {
        const fadeOutDur = clip.duration / speed;
        const fadeOutStart = Math.max(0, fadeOutDur - clip.fadeOut);
        aFilters.push(`afade=t=out:st=${fadeOutStart.toFixed(2)}:d=${clip.fadeOut.toFixed(2)}`);
      }

      const aArgs = [...args];
      if (aFilters.length) aArgs.push('-af', aFilters.join(','));
      aArgs.push('-map', '0:a:0', '-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-ar', '44100', '-t', (trimDur / speed).toFixed(3), '-y', outFile);

      let ret = await ffmpeg.exec(aArgs);
      let ok = ret === 0;
      if (ok) { try { const d = await ffmpeg.readFile(outFile); ok = d instanceof Uint8Array && d.byteLength > 100; } catch { ok = false; } }

      if (!ok) {
        // fallback: use silent
        await ffmpeg.exec([...args.slice(0, args.indexOf('-f')), '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100', '-t', (trimDur / speed).toFixed(3), '-c:a', 'aac', '-b:a', '128k', '-y', outFile]);
      }

      processedAudio.push({ file: outFile, start: clip.startOnTimeline, duration: clip.duration, fileDuration: trimDur / speed, index: i });
    } else if (isImage) {
      // ── Image clip: loop a still image into a video of the required duration ──
      const clipDur = clip.duration / (clip.speed || 1);
      const scaleFilter = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1`;
      let vf = scaleFilter;
      // visual effects
      const efx = effectsToFilter(clip.effects);
      if (efx) vf += ',' + efx;
      // video fades
      if (clip.fadeIn > 0) vf += `,fade=t=in:st=0:d=${clip.fadeIn.toFixed(2)}`;
      if (clip.fadeOut > 0) {
        const foStart = Math.max(0, clipDur - clip.fadeOut);
        vf += `,fade=t=out:st=${foStart.toFixed(2)}:d=${clip.fadeOut.toFixed(2)}`;
      }

      const imgArgs = [
        '-loop', '1',
        '-i', inFile,
        '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
        '-vf', vf,
        '-map', '0:v:0', '-map', '1:a:0',
        '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', String(settings.crf ?? 23), '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-ar', '44100',
        '-r', String(fps),
        '-t', clipDur.toFixed(3),
        '-movflags', '+faststart', '-y', outFile,
      ];

      const ret = await ffmpeg.exec(imgArgs);
      let ok = ret === 0;
      if (ok) { try { const d = await ffmpeg.readFile(outFile); ok = d instanceof Uint8Array && d.byteLength > 100; } catch { ok = false; } }

      if (!ok) {
        // Fallback: without audio
        console.warn(`[export] image encode with audio failed, retrying video-only`);
        const imgFallback = [
          '-loop', '1',
          '-i', inFile,
          '-vf', vf,
          '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', String(settings.crf ?? 23), '-pix_fmt', 'yuv420p',
          '-r', String(fps),
          '-t', clipDur.toFixed(3),
          '-movflags', '+faststart', '-an', '-y', outFile,
        ];
        await ffmpeg.exec(imgFallback);
      }

      processedVideo.push({ file: outFile, start: clip.startOnTimeline, duration: clip.duration, fileDuration: clipDur, index: i });
      console.log(`[export] clip[${i}] → processedVideo (image) file=${outFile} start=${clip.startOnTimeline.toFixed(2)}`);
    } else {
      const scaleFilter = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1`;
      let vf = scaleFilter;
      if (speed !== 1) vf += `,setpts=PTS*${(1 / speed).toFixed(4)}`;
      // visual effects
      const efx = effectsToFilter(clip.effects);
      if (efx) vf += ',' + efx;
      // video fades
      if (clip.fadeIn > 0) vf += `,fade=t=in:st=0:d=${clip.fadeIn.toFixed(2)}`;
      if (clip.fadeOut > 0) {
        const outDur = trimDur / speed;
        const foStart = Math.max(0, outDur - clip.fadeOut);
        vf += `,fade=t=out:st=${foStart.toFixed(2)}:d=${clip.fadeOut.toFixed(2)}`;
      }

      const aFilters: string[] = [];
      if (speed !== 1) {
        let r = speed;
        while (r > 2) { aFilters.push('atempo=2.0'); r /= 2; }
        while (r < 0.5) { aFilters.push('atempo=0.5'); r /= 0.5; }
        aFilters.push(`atempo=${r.toFixed(4)}`);
      }
      if (vol !== 1) aFilters.push(`volume=${vol.toFixed(2)}`);
      if (clip.fadeIn > 0) aFilters.push(`afade=t=in:st=0:d=${clip.fadeIn.toFixed(2)}`);
      if (clip.fadeOut > 0) {
        const outDur = trimDur / speed;
        const foStart = Math.max(0, outDur - clip.fadeOut);
        aFilters.push(`afade=t=out:st=${foStart.toFixed(2)}:d=${clip.fadeOut.toFixed(2)}`);
      }

      // First try with original audio (map 0:a:0)
      const withAudioArgs = [...args, '-vf', vf];
      if (aFilters.length) withAudioArgs.push('-af', aFilters.join(','));
      withAudioArgs.push('-map', '0:v:0', '-map', '0:a:0',
        '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', String(settings.crf ?? 23), '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-ar', '44100',
        '-r', String(fps), '-t', (trimDur / speed).toFixed(3), '-movflags', '+faststart', '-y', outFile);

      let ret = await ffmpeg.exec(withAudioArgs);
      let ok = ret === 0;
      if (ok) { try { const d = await ffmpeg.readFile(outFile); ok = d instanceof Uint8Array && d.byteLength > 100; } catch { ok = false; } }

      if (!ok) {
        // Fallback: use silent audio (anullsrc from input 1)
        const silentArgs = [...args, '-vf', vf];
        if (aFilters.length) silentArgs.push('-af', aFilters.join(','));
        silentArgs.push('-map', '0:v:0', '-map', '1:a:0',
          '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', String(settings.crf ?? 23), '-pix_fmt', 'yuv420p',
          '-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-ar', '44100',
          '-r', String(fps), '-t', (trimDur / speed).toFixed(3),
          '-movflags', '+faststart', '-y', outFile);
        ret = await ffmpeg.exec(silentArgs);
        ok = ret === 0;
        if (ok) { try { const d = await ffmpeg.readFile(outFile); ok = d instanceof Uint8Array && d.byteLength > 100; } catch { ok = false; } }
      }

      if (!ok) {
        // Last resort: video only, no audio
        const videoOnlyArgs = [...args.slice(0, args.indexOf('-f')), '-vf', vf,
          '-map', '0:v:0',
          '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', String(settings.crf ?? 23), '-pix_fmt', 'yuv420p',
          '-r', String(fps), '-t', (trimDur / speed).toFixed(3),
          '-movflags', '+faststart', '-an', '-y', outFile];
        await ffmpeg.exec(videoOnlyArgs);
      }

      processedVideo.push({ file: outFile, start: clip.startOnTimeline, duration: clip.duration, fileDuration: trimDur / speed, index: i });
      console.log(`[export] clip[${i}] → processedVideo (video) file=${outFile} start=${clip.startOnTimeline.toFixed(2)}`);
    }

    deleteFile(ffmpeg, inFile);
  }

  /* ── 2. Combine video clips on the timeline ────────── */
  progress('Компоновка видео…');

  let videoResult = `blank.mp4`;
  // Compute totalDur from actual processed file lengths to avoid black tail.
  // processedVideo fileDuration is the real encoded length (trimDur/speed).
  // For text/audio-only projects fall back to store clips.
  const totalDurVideo = processedVideo.length > 0
    ? Math.max(...processedVideo.map((pv) => pv.start + pv.fileDuration))
    : 0;
  const totalDurAudio = processedAudio.length > 0
    ? Math.max(...processedAudio.map((pa) => pa.start + pa.fileDuration))
    : 0;
  const totalDurText = textItems.length > 0
    ? Math.max(...textItems.map((t) => t.startOnTimeline + t.duration))
    : 0;
  const totalDur = Math.max(totalDurVideo, totalDurAudio, totalDurText, 1);

  if (processedVideo.length === 0) {
    // black canvas for text-only project
    await ffmpeg.exec([
      '-f', 'lavfi', '-i', `color=c=black:s=${width}x${height}:d=${totalDur.toFixed(3)}:r=${fps}`,
      '-f', 'lavfi', '-i', `anullsrc=channel_layout=stereo:sample_rate=44100`,
      '-t', totalDur.toFixed(3),
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k',
      '-shortest', '-y', videoResult,
    ]);
  } else if (processedVideo.length === 1 && processedVideo[0].start < 0.1 && transitions.length === 0) {
    videoResult = processedVideo[0].file;
  } else {
    // ── Build sorted list of all clips to composite ──────────────────────────
    // Strategy: overlay each clip individually onto a growing composite.
    // Clips are sorted: bottom tracks first (higher index = background),
    // within each track by timeline position.
    // This ensures correct z-ordering and gaps are transparent (show layers below).

    console.log(`[export] Step2: processedVideo=${processedVideo.length} clips, totalDur=${totalDur.toFixed(3)}s`);
    processedVideo.forEach((pv, i) => {
      const c = allClips[pv.index];
      const tIdx = videoTracks.findIndex((t) => t.id === c.trackId);
      console.log(`  pv[${i}] file=${pv.file} start=${pv.start.toFixed(3)} dur=${pv.duration.toFixed(3)} trackIdx=${tIdx} trackId=${c.trackId}`);
    });

    // Group by track, sorted: background tracks first (high index), top track last
    const sortedByTrackThenTime = [...processedVideo].sort((a, b) => {
      const clipA = allClips[a.index];
      const clipB = allClips[b.index];
      const trackIdxA = videoTracks.findIndex((t) => t.id === clipA.trackId);
      const trackIdxB = videoTracks.findIndex((t) => t.id === clipB.trackId);
      if (trackIdxA !== trackIdxB) return trackIdxB - trackIdxA; // higher index first (background)
      return a.start - b.start; // within same track: timeline order
    });

    console.log(`[export] Step2 sorted order:`);
    sortedByTrackThenTime.forEach((pv, i) => {
      const c = allClips[pv.index];
      const tIdx = videoTracks.findIndex((t) => t.id === c.trackId);
      console.log(`  sorted[${i}] file=${pv.file} start=${pv.start.toFixed(3)} trackIdx=${tIdx}`);
    });

    // Handle xfade transitions: find consecutive same-track clip pairs with transitions
    // and merge them first, then overlay the result
    const mergedClips: { file: string; start: number; duration: number; trackId: string; opacity?: number; merged?: boolean }[] = [];
    const usedIndices = new Set<number>();

    for (let si = 0; si < sortedByTrackThenTime.length; si++) {
      if (usedIndices.has(si)) continue;
      const pv = sortedByTrackThenTime[si];
      const clip = allClips[pv.index];

      // Look for a transition with the next clip on the same track
      const nextSi = sortedByTrackThenTime.findIndex(
        (p2, idx) => !usedIndices.has(idx) && idx > si && allClips[p2.index].trackId === clip.trackId,
      );
      if (nextSi >= 0) {
        const nextPV = sortedByTrackThenTime[nextSi];
        const nextClip = allClips[nextPV.index];
        const tr = transitions.find(
          (t) =>
            (t.clipAId === clip.id && t.clipBId === nextClip.id) ||
            (t.clipBId === clip.id && t.clipAId === nextClip.id),
        );
        if (tr && tr.duration > 0.05) {
          // Merge these two clips with xfade.
          // Use fileDuration (actual encoded length) not clip.duration for timing accuracy.
          const xfadeName = xfadeTransition(tr.type);
          const xfadeOffset = Math.max(0, pv.fileDuration - tr.duration);
          const mergedFile = `xf_${si}.mp4`;
          const filterComplex = [
            `[0:v][1:v]xfade=transition=${xfadeName}:duration=${tr.duration.toFixed(3)}:offset=${xfadeOffset.toFixed(3)}[vout]`,
            `[1:a]adelay=${Math.round(xfadeOffset * 1000)}|${Math.round(xfadeOffset * 1000)}[da]`,
            `[0:a][da]amix=inputs=2:normalize=0[aout]`,
          ].join(';');
          const xfArgs = [
            '-i', pv.file, '-i', nextPV.file,
            '-filter_complex', filterComplex,
            '-map', '[vout]', '-map', '[aout]',
            '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', String(settings.crf ?? 23), '-pix_fmt', 'yuv420p',
            '-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-ar', '44100',
            '-r', String(fps), '-movflags', '+faststart', '-y', mergedFile,
          ];
          let ret = await ffmpeg.exec(xfArgs);
          let ok = ret === 0;
          if (ok) { try { const d = await ffmpeg.readFile(mergedFile); ok = d instanceof Uint8Array && d.byteLength > 100; } catch { ok = false; } }
          if (ok) {
            const mergedDur = pv.fileDuration + nextPV.fileDuration - tr.duration;
            // For xfade-merged clips, use opacity of clip A (first clip in transition)
            mergedClips.push({ file: mergedFile, start: pv.start, duration: mergedDur, trackId: clip.trackId, opacity: clip.effects?.opacity, merged: true });
            usedIndices.add(si);
            usedIndices.add(nextSi);
            deleteFile(ffmpeg, pv.file);
            deleteFile(ffmpeg, nextPV.file);
            continue;
          } else {
            console.warn(`[export] xfade failed during merge, keeping clips separate`);
            deleteFile(ffmpeg, mergedFile);
          }
        }
      }

      mergedClips.push({ file: pv.file, start: pv.start, duration: pv.fileDuration, trackId: clip.trackId, opacity: clip.effects?.opacity });
      usedIndices.add(si);
    }

    // ── Build black base ──
    const baseFile = 'base_black.mp4';
    console.log(`[export] Step2: creating black base ${width}x${height} dur=${totalDur.toFixed(3)}s fps=${fps}`);
    await ffmpeg.exec([
      '-f', 'lavfi', '-i', `color=c=black:s=${width}x${height}:d=${totalDur.toFixed(3)}:r=${fps}`,
      '-f', 'lavfi', '-i', `anullsrc=channel_layout=stereo:sample_rate=44100`,
      '-t', totalDur.toFixed(3),
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '18', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k',
      '-shortest', '-y', baseFile,
    ]);

    // ── One-shot filter_complex: overlay all clips onto black base in a single FFmpeg call ──
    // This avoids re-encoding the composite N times (which causes OOM in FFmpeg.wasm).
    console.log(`[export] Step2: mergedClips=${mergedClips.length}`);
    mergedClips.forEach((mc, i) => console.log(`  mc[${i}] file=${mc.file} start=${mc.start.toFixed(3)} dur=${mc.duration.toFixed(3)}`));

    const compositeFile = 'composite.mp4';

    if (mergedClips.length === 0) {
      // Nothing to overlay — use black base directly
      videoResult = baseFile;
    } else {
      // Build a single filter_complex that chains all overlays:
      // [base][clip0_shifted]overlay[tmp0]; [tmp0][clip1_shifted]overlay[tmp1]; ...
      // Audio: sum all clip audio streams delayed to their timeline positions
      const fcParts: string[] = [];
      const inputArgs: string[] = ['-i', baseFile];

      for (let ci = 0; ci < mergedClips.length; ci++) {
        const mc = mergedClips[ci];
        inputArgs.push('-i', mc.file);
        const offset = mc.start;
        // trim=duration enforces exact clip length, then setpts shifts it to its timeline position.
        // This is the safety net: even if proc_N.mp4 is longer than expected, we cut it here.
        fcParts.push(`[${ci + 1}:v]trim=duration=${mc.duration.toFixed(3)},setpts=PTS-STARTPTS+${offset.toFixed(3)}/TB[v${ci}]`);
      }

      // Chain video overlays: [base_v][v0]overlay→[ov0]; [ov0][v1]overlay→[ov1]; ...
      // For clips with opacity < 1: first convert to yuva420p and set alpha channel,
      // then use overlay=format=auto so FFmpeg respects the alpha transparency.
      for (let ci = 0; ci < mergedClips.length; ci++) {
        const inV = ci === 0 ? '[0:v]' : `[ov${ci - 1}]`;
        const mc = mergedClips[ci];
        const opacity = mc.opacity;
        const hasAlpha = opacity !== undefined && opacity >= 0 && opacity < 1;

        if (hasAlpha) {
          // Add real alpha channel: format=yuva420p gives us the alpha plane,
          // colorchannelmixer=aa=OPACITY sets every pixel's alpha to OPACITY.
          // overlay=format=auto then blends using that alpha (real transparency).
          const a = opacity!.toFixed(3);
          fcParts.push(`[v${ci}]format=yuva420p,colorchannelmixer=aa=${a}[va${ci}]`);
          fcParts.push(`${inV}[va${ci}]overlay=format=auto:eof_action=pass:shortest=0[ov${ci}]`);
        } else {
          fcParts.push(`${inV}[v${ci}]overlay=eof_action=pass:shortest=0[ov${ci}]`);
        }
      }
      fcParts.push(`[ov${mergedClips.length - 1}]copy[vout]`);

      // Build audio mix: delay each clip's audio to its timeline position, then amix
      const audioInputs: string[] = ['[0:a]']; // base silent audio
      for (let ci = 0; ci < mergedClips.length; ci++) {
        const mc = mergedClips[ci];
        const adelay = Math.round(mc.start * 1000);
        // atrim limits audio to clip's timeline duration, then adelay shifts it into position
        fcParts.push(`[${ci + 1}:a]atrim=duration=${mc.duration.toFixed(3)},adelay=${adelay}|${adelay}[a${ci}]`);
        audioInputs.push(`[a${ci}]`);
      }
      const amixInputs = audioInputs.length;
      fcParts.push(`${audioInputs.join('')}amix=inputs=${amixInputs}:normalize=0[aout]`);

      const filterComplex = fcParts.join(';');
      console.log(`[export] Step2 filter_complex (${mergedClips.length} clips):`, filterComplex.substring(0, 200));

      const compositeArgs = [
        ...inputArgs,
        '-filter_complex', filterComplex,
        '-map', '[vout]', '-map', '[aout]',
        '-t', totalDur.toFixed(3),
        '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', String(settings.crf ?? 23), '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-ar', '44100',
        '-r', String(fps), '-movflags', '+faststart', '-y', compositeFile,
      ];

      const ret = await ffmpeg.exec(compositeArgs);
      let ok = ret === 0;
      if (ok) { try { const d = await ffmpeg.readFile(compositeFile); ok = d instanceof Uint8Array && d.byteLength > 100; } catch { ok = false; } }

      if (!ok) {
        // Fallback: video-only composite (drop audio mix, use base audio only)
        console.warn(`[export] Step2 composite with audio failed, retrying video-only`);
        // Re-build video-only fc (same alpha logic as main path)
        const fcVParts: string[] = [];
        for (let ci = 0; ci < mergedClips.length; ci++) {
          const mc = mergedClips[ci];
          fcVParts.push(`[${ci + 1}:v]trim=duration=${mc.duration.toFixed(3)},setpts=PTS-STARTPTS+${mc.start.toFixed(3)}/TB[v${ci}]`);
        }
        for (let ci = 0; ci < mergedClips.length; ci++) {
          const inV = ci === 0 ? '[0:v]' : `[ov${ci - 1}]`;
          const mc = mergedClips[ci];
          const opacity = mc.opacity;
          const hasAlpha = opacity !== undefined && opacity >= 0 && opacity < 1;
          if (hasAlpha) {
            const a = opacity!.toFixed(3);
            fcVParts.push(`[v${ci}]format=yuva420p,colorchannelmixer=aa=${a}[va${ci}]`);
            fcVParts.push(`${inV}[va${ci}]overlay=format=auto:eof_action=pass:shortest=0[ov${ci}]`);
          } else {
            fcVParts.push(`${inV}[v${ci}]overlay=eof_action=pass:shortest=0[ov${ci}]`);
          }
        }
        const compositeVArgs = [
          ...inputArgs,
          '-filter_complex', fcVParts.join(';'),
          '-map', `[ov${mergedClips.length - 1}]`, '-map', '0:a',
          '-t', totalDur.toFixed(3),
          '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', String(settings.crf ?? 23), '-pix_fmt', 'yuv420p',
          '-c:a', 'copy',
          '-r', String(fps), '-movflags', '+faststart', '-y', compositeFile,
        ];
        const ret2 = await ffmpeg.exec(compositeVArgs);
        ok = ret2 === 0;
        if (ok) { try { const d = await ffmpeg.readFile(compositeFile); ok = d instanceof Uint8Array && d.byteLength > 100; } catch { ok = false; } }
      }

      // Clean up merged clip files
      for (const mc of mergedClips) deleteFile(ffmpeg, mc.file);
      deleteFile(ffmpeg, baseFile);

      if (ok) {
        console.log(`[export] Step2 composite SUCCESS → ${compositeFile}`);
        videoResult = compositeFile;
      } else {
        console.warn(`[export] Step2 composite FAILED, falling back to base_black`);
        videoResult = baseFile;
      }
    }
  } // end else (processedVideo.length > 1)

  /* ── 3. Burn text overlays via drawtext ────────────── */
  if (textItems.length > 0) {
    progress('Загрузка шрифтов…');
    const hasFont = await ensureFontsInFS(ffmpeg);

    progress('Наложение текста…');

    // Apply drawtext filters one at a time for better compatibility
    let txtCurrent = videoResult;
    let txtSuccess = false;

    for (let ti = 0; ti < textItems.length; ti++) {
      const t = textItems[ti];
      const txtOutput = `text_${ti}.mp4`;

      // FFmpeg.wasm receives the filter string directly (no shell).
      // drawtext special chars: ' : \ must be escaped with \.
      const escDrawtext = (s: string) => s
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "'\\''")
        .replace(/:/g, '\\:')
        .replace(/%/g, '%%');

      const x = Math.round(t.x * width);
      const y = Math.round(t.y * height);
      const textContent = t.text.replace(/\n/g, ' ');  // drawtext doesn't handle \n well
      const fontFile = fontFileForWeight(t.fontWeight);

      const parts: string[] = [];
      if (hasFont) parts.push(`fontfile=${fontFile}`);
      parts.push(
        `text='${escDrawtext(textContent)}'`,
        `fontsize=${t.fontSize}`,
        `fontcolor=${t.color}`,
        `x=${x}-tw/2`,
        `y=${y}-th/2`,
      );

      if (t.strokeWidth > 0) parts.push(`borderw=${t.strokeWidth}`, `bordercolor=${t.strokeColor ?? 'black'}`);
      if (t.shadowBlur > 0) parts.push(`shadowx=2`, `shadowy=2`, `shadowcolor=${t.shadowColor ?? 'black'}`);
      if (t.backgroundColor) parts.push(`box=1`, `boxcolor=${t.backgroundColor}@0.6`, `boxborderw=8`);

      // Fade in/out alpha expression using absolute time
      // drawtext 'alpha' supports expressions; commas in expressions must NOT be escaped
      if (t.fadeIn > 0 || t.fadeOut > 0) {
        const tStart = t.startOnTimeline;
        const tEnd = t.startOnTimeline + t.duration;
        // Build alpha expression pieces
        let alphaExpr = '1';
        if (t.fadeIn > 0) {
          // ramp from 0 to 1 during [tStart, tStart+fadeIn]
          alphaExpr = `if(lt(t,${(tStart + t.fadeIn).toFixed(3)}),(t-${tStart.toFixed(3)})/${t.fadeIn.toFixed(3)},1)`;
        }
        if (t.fadeOut > 0) {
          const fadeOutStart = (tEnd - t.fadeOut).toFixed(3);
          const fadeOutExpr = `if(gt(t,${fadeOutStart}),(${tEnd.toFixed(3)}-t)/${t.fadeOut.toFixed(3)},1)`;
          if (t.fadeIn > 0) {
            alphaExpr = `min(${alphaExpr},${fadeOutExpr})`;
          } else {
            alphaExpr = fadeOutExpr;
          }
        }
        // Multiply by general opacity
        if (t.opacity < 1) {
          alphaExpr = `(${alphaExpr})*${t.opacity.toFixed(2)}`;
        }
        parts.push(`alpha='${alphaExpr}'`);
      } else if (t.opacity < 1) {
        parts.push(`alpha=${t.opacity.toFixed(2)}`);
      }

      // enable window at absolute time
      parts.push(`enable='between(t,${t.startOnTimeline.toFixed(3)},${(t.startOnTimeline + t.duration).toFixed(3)})'`);

      const vfStr = `drawtext=${parts.join(':')}`;
      console.log(`[export] drawtext filter for item ${ti}:`, vfStr);

      const txtRet = await ffmpeg.exec([
        '-i', txtCurrent, '-vf', vfStr,
        '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', String(settings.crf ?? 23), '-pix_fmt', 'yuv420p',
        '-c:a', 'copy',
        '-movflags', '+faststart', '-y', txtOutput,
      ]);

      let txtOk = txtRet === 0;
      if (txtOk) { try { const d = await ffmpeg.readFile(txtOutput); txtOk = d instanceof Uint8Array && d.byteLength > 100; } catch { txtOk = false; } }

      if (!txtOk) {
        // Retry without alpha, enable — simplest possible drawtext
        console.warn(`[export] drawtext failed for item ${ti}, retrying simplified...`);
        const simpleParts: string[] = [];
        if (hasFont) simpleParts.push(`fontfile=${fontFile}`);
        simpleParts.push(
          `text='${escDrawtext(textContent)}'`,
          `fontsize=${t.fontSize}`,
          `fontcolor=${t.color}`,
          `x=${x}-tw/2`,
          `y=${y}-th/2`,
        );
        const simpleVf = `drawtext=${simpleParts.join(':')}`;
        const retryRet = await ffmpeg.exec([
          '-i', txtCurrent, '-vf', simpleVf,
          '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', String(settings.crf ?? 23), '-pix_fmt', 'yuv420p',
          '-c:a', 'copy',
          '-movflags', '+faststart', '-y', txtOutput,
        ]);
        txtOk = retryRet === 0;
        if (txtOk) { try { const d = await ffmpeg.readFile(txtOutput); txtOk = d instanceof Uint8Array && d.byteLength > 100; } catch { txtOk = false; } }
      }

      if (txtOk) {
        if (txtSuccess) deleteFile(ffmpeg, txtCurrent);
        else if (txtCurrent === videoResult) deleteFile(ffmpeg, videoResult);
        txtCurrent = txtOutput;
        txtSuccess = true;
      } else {
        console.warn(`[export] drawtext completely failed for text item ${ti}, skipping`);
        deleteFile(ffmpeg, txtOutput);
      }
    }

    if (txtSuccess) {
      videoResult = txtCurrent;
    }
  }

  /* ── 4. Mix in audio tracks ────────────────────────── */
  if (processedAudio.length > 0) {
    progress('Микширование аудио…');
    const audioMixInput = videoResult;
    const audioMixOutput = 'amix_out.mp4';

    // Strategy: mix iteratively — fold each audio track one at a time.
    // This avoids amix with many inputs and dropout_transition (removed in newer ffmpeg).
    // Each step: take current video (with embedded audio) + one extra audio → merge.
    let mixCurrent = audioMixInput;

    for (let i = 0; i < processedAudio.length; i++) {
      const pa = processedAudio[i];
      const mixOut = `amix_${i}.mp4`;
      const delayMs = Math.round(pa.start * 1000);

      // Mix current file's audio with the new audio track (delayed)
      const filterComplex = [
        `[1:a]adelay=${delayMs}|${delayMs}[delayed]`,
        `[0:a][delayed]amix=inputs=2:normalize=0[aout]`,
      ].join(';');

      const amRet = await ffmpeg.exec([
        '-i', mixCurrent,
        '-i', pa.file,
        '-filter_complex', filterComplex,
        '-map', '0:v', '-map', '[aout]',
        '-c:v', 'copy',
        '-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-ar', '44100',
        '-movflags', '+faststart', '-y', mixOut,
      ]);

      let amOk = amRet === 0;
      if (amOk) { try { const d = await ffmpeg.readFile(mixOut); amOk = d instanceof Uint8Array && d.byteLength > 100; } catch { amOk = false; } }

      if (amOk) {
        if (mixCurrent !== audioMixInput) deleteFile(ffmpeg, mixCurrent);
        mixCurrent = mixOut;
      } else {
        console.warn(`[export] audio mix failed for track ${i}, skipping`);
        deleteFile(ffmpeg, mixOut);
      }
      deleteFile(ffmpeg, pa.file);
    }

    if (mixCurrent !== audioMixInput) {
      deleteFile(ffmpeg, audioMixInput);
      videoResult = mixCurrent;
    } else {
      console.warn('[export] all audio mixes failed, keeping video without extra audio');
    }
  }

  /* ── 5. Read final result ──────────────────────────── */
  progress('Завершение…');
  const data = await ffmpeg.readFile(videoResult);
  deleteFile(ffmpeg, videoResult);

  let blobData: ArrayBuffer;
  if (data instanceof Uint8Array) {
    const copy = new Uint8Array(data.byteLength);
    copy.set(data);
    blobData = copy.buffer as ArrayBuffer;
  } else {
    blobData = new TextEncoder().encode(data as string).buffer as ArrayBuffer;
  }

  onProgress?.(100, 'Готово!');
  // Reset the FFmpeg instance — after Aborted() the WASM runtime is dead,
  // the next export must create a fresh instance.
  resetFFmpeg();
  return new Blob([blobData], { type: 'video/mp4' });
}
