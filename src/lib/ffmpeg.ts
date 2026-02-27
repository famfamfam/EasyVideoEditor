/**
 * FFmpeg.wasm singleton — client-side video processing.
 * Lazy-loads FFmpeg core (~31MB) on first use.
 * Single-threaded mode (no SharedArrayBuffer/COOP/COEP).
 */
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

let ffmpegInstance: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;

/** Call after each export to discard the potentially crashed WASM instance. */
export function resetFFmpeg(): void {
  ffmpegInstance = null;
  loadPromise = null;
}

export type ProgressCallback = (progress: number, message: string) => void;

function withTimeout<T>(promise: Promise<T>, ms: number, msg: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(msg)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

async function toDataURL(url: string): Promise<string> {
  const response = await fetch(url);
  const text = await response.text();
  const base64 = btoa(unescape(encodeURIComponent(text)));
  return `data:text/javascript;base64,${base64}`;
}

export async function getFFmpeg(onProgress?: ProgressCallback): Promise<FFmpeg> {
  if (ffmpegInstance && ffmpegInstance.loaded) return ffmpegInstance;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const ffmpeg = new FFmpeg();

    ffmpeg.on('log', ({ message }) => {
      console.debug('[FFmpeg]', message);
    });

    ffmpeg.on('progress', ({ progress }) => {
      if (progress >= 0 && progress <= 1) {
        onProgress?.(Math.round(progress * 100), 'Обработка видео...');
      }
    });

    onProgress?.(5, 'Загрузка видео-движка...');

    const sources = [
      { base: `${window.location.origin}/ffmpeg`, label: 'local' },
      { base: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm', label: 'CDN unpkg' },
      { base: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm', label: 'CDN jsdelivr' },
    ];

    let loaded = false;

    for (const { base: baseURL, label } of sources) {
      const isLocal = label === 'local';
      try {
        onProgress?.(10, isLocal ? 'Загрузка видео-движка...' : `Загрузка с ${label}...`);
        const coreURL = await toDataURL(`${baseURL}/ffmpeg-core.js`);
        onProgress?.(40, 'Загрузка WASM (~30 МБ)...');
        const wasmURL = await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm');
        onProgress?.(75, 'Инициализация...');

        await withTimeout(
          ffmpeg.load({ coreURL, wasmURL }),
          120_000,
          'Таймаут инициализации видео-движка (120с)',
        );
        loaded = true;
        console.log(`[FFmpeg] Loaded from ${label}`);
        break;
      } catch (err) {
        console.warn(`[FFmpeg] Failed to load from ${label}:`, err);
        continue;
      }
    }

    if (!loaded) {
      throw new Error('Не удалось загрузить видео-движок. Попробуйте обновить страницу.');
    }

    ffmpegInstance = ffmpeg;
    onProgress?.(100, 'Видео-движок готов');
    return ffmpeg;
  })();

  try {
    return await loadPromise;
  } catch (err) {
    loadPromise = null;
    ffmpegInstance = null;
    throw err;
  }
}

export interface TrimOptions {
  startTime: number;
  endTime: number;
}

export type TransitionType = 'none' | 'crossfade' | 'fade-black';

export interface ClipInput {
  url: string;
  trim?: TrimOptions;
  index: number;
  speed?: number;
  volume?: number;
  transition?: TransitionType;
  transitionDuration?: number;
}

export interface MergeOptions {
  fadeInDuration?: number;
  fadeOutDuration?: number;
}

async function writeVideoToFS(ffmpeg: FFmpeg, url: string, filename: string): Promise<void> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} при загрузке видео`);
  const buf = await resp.arrayBuffer();
  await ffmpeg.writeFile(filename, new Uint8Array(buf));
}

/**
 * Trim, speed-adjust, volume-adjust, and concatenate video clips.
 * Supports crossfade/fade-to-black transitions and global fade in/out.
 */
export async function mergeClips(
  clips: ClipInput[],
  onProgress?: ProgressCallback,
  options?: MergeOptions,
): Promise<Blob> {
  if (clips.length === 0) throw new Error('Нет клипов для склейки');

  onProgress?.(0, 'Запуск видео-движка...');
  const ffmpeg = await getFFmpeg(onProgress);
  onProgress?.(0, 'Подготовка клипов...');

  const processedFiles: string[] = [];

  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    const inputFile = `input_${i}.mp4`;
    const outputFile = `clip_${i}.mp4`;
    const baseProgress = Math.round((i / clips.length) * 60);

    onProgress?.(baseProgress, `Загрузка клипа ${i + 1} из ${clips.length}...`);

    try {
      await writeVideoToFS(ffmpeg, clip.url, inputFile);
    } catch {
      throw new Error(`Не удалось загрузить клип ${i + 1}. Проверьте файл.`);
    }

    onProgress?.(baseProgress + 5, `Обработка клипа ${i + 1} из ${clips.length}...`);

    const needsTrim = clip.trim && (clip.trim.startTime > 0.05 || clip.trim.endTime < Infinity);
    const args: string[] = [];

    if (needsTrim && clip.trim!.startTime > 0.05) {
      args.push('-ss', clip.trim!.startTime.toFixed(3));
    }
    args.push('-i', inputFile);
    if (needsTrim && clip.trim!.endTime < Infinity) {
      const duration = clip.trim!.endTime - (clip.trim!.startTime > 0.05 ? clip.trim!.startTime : 0);
      args.push('-t', duration.toFixed(3));
    }

    // Silent audio source — guarantees every output has audio
    args.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');

    const speed = clip.speed ?? 1.0;
    const volume = clip.volume ?? 1.0;

    const scaleFilter = 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1';
    let vFilter = scaleFilter;
    if (speed !== 1.0) {
      vFilter += `,setpts=PTS*${(1 / speed).toFixed(4)}`;
    }

    const aFilters: string[] = [];
    if (speed !== 1.0) {
      let remaining = speed;
      while (remaining > 2.0) { aFilters.push('atempo=2.0'); remaining /= 2.0; }
      while (remaining < 0.5) { aFilters.push('atempo=0.5'); remaining /= 0.5; }
      aFilters.push(`atempo=${remaining.toFixed(4)}`);
    }
    if (volume !== 1.0) aFilters.push(`volume=${volume.toFixed(2)}`);
    const aFilterOrig = aFilters.length > 0 ? aFilters.join(',') : '';
    const aFilterSilent = volume !== 1.0 ? `volume=${volume.toFixed(2)}` : '';

    const encodeOpts = [
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-ar', '44100',
      '-shortest', '-movflags', '+faststart', '-y', outputFile,
    ];

    // Try with original audio first
    const origAudioArgs = aFilterOrig
      ? [...args, '-vf', vFilter, '-af', aFilterOrig, '-map', '0:v:0', '-map', '0:a:0', ...encodeOpts]
      : [...args, '-vf', vFilter, '-map', '0:v:0', '-map', '0:a:0', ...encodeOpts];
    const ret = await ffmpeg.exec(origAudioArgs);

    let outputExists = false;
    if (ret === 0) {
      try {
        const d = await ffmpeg.readFile(outputFile);
        outputExists = d instanceof Uint8Array && d.byteLength > 100;
      } catch { /* */ }
    }

    if (!outputExists) {
      const silentAudioArgs = aFilterSilent
        ? [...args, '-vf', vFilter, '-af', aFilterSilent, '-map', '0:v:0', '-map', '1:a:0', ...encodeOpts]
        : [...args, '-vf', vFilter, '-map', '0:v:0', '-map', '1:a:0', ...encodeOpts];
      await ffmpeg.exec(silentAudioArgs);
    }

    try {
      const stat = await ffmpeg.readFile(outputFile);
      if (!stat || (stat instanceof Uint8Array && stat.byteLength < 100)) {
        throw new Error(`Не удалось обработать клип ${i + 1}`);
      }
    } catch {
      throw new Error(`Ошибка обработки клипа ${i + 1}. Формат может не поддерживаться.`);
    }

    try { await ffmpeg.deleteFile(inputFile); } catch { /* ok */ }
    processedFiles.push(outputFile);
  }

  onProgress?.(65, 'Склеиваю клипы...');

  let resultFile: string;
  const hasTransitions = clips.some((c, i) => i < clips.length - 1 && c.transition && c.transition !== 'none');

  if (processedFiles.length === 1) {
    resultFile = processedFiles[0];
  } else if (hasTransitions) {
    // Probe durations
    const actualDurations: number[] = [];
    for (let i = 0; i < processedFiles.length; i++) {
      const c = clips[i];
      const speed = c.speed ?? 1.0;
      const rawDur = c.trim ? (c.trim.endTime - c.trim.startTime) : 30;
      actualDurations.push(rawDur / speed);
    }

    for (let i = 0; i < processedFiles.length; i++) {
      let probedDuration = 0;
      const logMessages: string[] = [];
      const logHandler = ({ message }: { message: string }) => { logMessages.push(message); };
      ffmpeg.on('log', logHandler);
      try {
        await ffmpeg.exec(['-i', processedFiles[i], '-f', 'null', '-']);
        for (const msg of logMessages) {
          const m = msg.match(/Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/);
          if (m) {
            probedDuration = parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseInt(m[3]) + parseInt(m[4]) / 100;
            break;
          }
        }
      } catch { /* ok */ }
      ffmpeg.off('log', logHandler);
      if (probedDuration > 0.1) actualDurations[i] = probedDuration;
    }

    let currentFile = processedFiles[0];
    let currentDuration = actualDurations[0];

    for (let i = 1; i < processedFiles.length; i++) {
      const transType = clips[i - 1].transition || 'none';
      const transDur = Math.min(clips[i - 1].transitionDuration ?? 0.5,
        currentDuration * 0.4, actualDurations[i] * 0.4);
      const nextFile = processedFiles[i];
      const outFile = `xfade_${i}.mp4`;

      if (transType === 'none') {
        const concatPair = `file '${currentFile}'\nfile '${nextFile}'`;
        await ffmpeg.writeFile('pair_concat.txt', concatPair);
        await ffmpeg.exec([
          '-f', 'concat', '-safe', '0', '-i', 'pair_concat.txt',
          '-c', 'copy', '-movflags', '+faststart', '-y', outFile,
        ]);
        try { await ffmpeg.deleteFile('pair_concat.txt'); } catch { /* */ }
        currentDuration = currentDuration + actualDurations[i];
      } else {
        const offset = Math.max(0, currentDuration - transDur);
        const xfadeTransition = transType === 'crossfade' ? 'fade' : 'fadeblack';
        const fc = `[0:v][1:v]xfade=transition=${xfadeTransition}:duration=${transDur.toFixed(3)}:offset=${offset.toFixed(3)}[vout];[0:a][1:a]acrossfade=d=${transDur.toFixed(3)}[aout]`;

        const ret = await ffmpeg.exec([
          '-i', currentFile, '-i', nextFile,
          '-filter_complex', fc,
          '-map', '[vout]', '-map', '[aout]',
          '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-pix_fmt', 'yuv420p',
          '-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-ar', '44100',
          '-movflags', '+faststart', '-y', outFile,
        ]);

        let ok = false;
        if (ret === 0) {
          try {
            const d = await ffmpeg.readFile(outFile);
            ok = d instanceof Uint8Array && d.byteLength > 100;
          } catch { /* */ }
        }

        if (!ok) {
          console.warn(`[FFmpeg] xfade failed for pair ${i}, fallback to concat`);
          const concatPair = `file '${currentFile}'\nfile '${nextFile}'`;
          await ffmpeg.writeFile('pair_concat.txt', concatPair);
          await ffmpeg.exec([
            '-f', 'concat', '-safe', '0', '-i', 'pair_concat.txt',
            '-c', 'copy', '-movflags', '+faststart', '-y', outFile,
          ]);
          try { await ffmpeg.deleteFile('pair_concat.txt'); } catch { /* */ }
          currentDuration = currentDuration + actualDurations[i];
        } else {
          currentDuration = currentDuration + actualDurations[i] - transDur;
        }
      }

      if (i > 1) {
        try { await ffmpeg.deleteFile(currentFile); } catch { /* */ }
      }
      currentFile = outFile;
    }

    resultFile = currentFile;
    for (const f of processedFiles) {
      try { await ffmpeg.deleteFile(f); } catch { /* ok */ }
    }
  } else {
    const concatList = processedFiles.map(f => `file '${f}'`).join('\n');
    await ffmpeg.writeFile('concat.txt', concatList);
    await ffmpeg.exec([
      '-f', 'concat', '-safe', '0', '-i', 'concat.txt',
      '-c', 'copy', '-movflags', '+faststart', '-y', 'output.mp4',
    ]);
    resultFile = 'output.mp4';
    for (const f of processedFiles) {
      try { await ffmpeg.deleteFile(f); } catch { /* ok */ }
    }
    try { await ffmpeg.deleteFile('concat.txt'); } catch { /* ok */ }
  }

  // Global fade in / fade out
  const fadeIn = options?.fadeInDuration ?? 0;
  const fadeOut = options?.fadeOutDuration ?? 0;

  if (fadeIn > 0 || fadeOut > 0) {
    onProgress?.(85, 'Применяю fade эффекты...');
    const fadeInputFile = resultFile;
    const fadeOutputFile = 'faded_output.mp4';

    let totalDuration = 0;
    const logMessages: string[] = [];
    const logHandler = ({ message }: { message: string }) => { logMessages.push(message); };
    ffmpeg.on('log', logHandler);
    try {
      await ffmpeg.exec(['-i', fadeInputFile, '-f', 'null', '-']);
      for (const msg of logMessages) {
        const m = msg.match(/Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/);
        if (m) {
          totalDuration = parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseInt(m[3]) + parseInt(m[4]) / 100;
          break;
        }
      }
    } catch { /* */ }
    ffmpeg.off('log', logHandler);

    if (totalDuration < 0.1) {
      totalDuration = 0;
      for (let i = 0; i < clips.length; i++) {
        const c = clips[i];
        const speed = c.speed ?? 1.0;
        const rawDur = c.trim ? (c.trim.endTime - c.trim.startTime) : 10;
        totalDuration += rawDur / speed;
        if (i > 0 && hasTransitions) {
          const transType = clips[i - 1].transition || 'none';
          const transDur = clips[i - 1].transitionDuration ?? 0.5;
          if (transType !== 'none') totalDuration -= transDur;
        }
      }
    }

    const vFinalFilters: string[] = [];
    const aFinalFilters: string[] = [];
    if (fadeIn > 0) {
      vFinalFilters.push(`fade=t=in:st=0:d=${fadeIn.toFixed(2)}`);
      aFinalFilters.push(`afade=t=in:st=0:d=${fadeIn.toFixed(2)}`);
    }
    if (fadeOut > 0 && totalDuration > fadeOut) {
      const fadeOutStart = totalDuration - fadeOut;
      vFinalFilters.push(`fade=t=out:st=${fadeOutStart.toFixed(2)}:d=${fadeOut.toFixed(2)}`);
      aFinalFilters.push(`afade=t=out:st=${fadeOutStart.toFixed(2)}:d=${fadeOut.toFixed(2)}`);
    }

    if (vFinalFilters.length > 0 || aFinalFilters.length > 0) {
      const fadeArgs: string[] = ['-i', fadeInputFile];
      if (vFinalFilters.length > 0) fadeArgs.push('-vf', vFinalFilters.join(','));
      if (aFinalFilters.length > 0) fadeArgs.push('-af', aFinalFilters.join(','));
      fadeArgs.push(
        '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-ar', '44100',
        '-movflags', '+faststart', '-y', fadeOutputFile,
      );

      const fadeRet = await ffmpeg.exec(fadeArgs);
      let fadeOk = false;
      if (fadeRet === 0) {
        try {
          const d = await ffmpeg.readFile(fadeOutputFile);
          fadeOk = d instanceof Uint8Array && d.byteLength > 100;
        } catch { /* */ }
      }

      if (fadeOk) {
        try { await ffmpeg.deleteFile(fadeInputFile); } catch { /* ok */ }
        resultFile = fadeOutputFile;
      } else {
        console.warn('[FFmpeg] Fade failed, using unfaded result');
        try { await ffmpeg.deleteFile(fadeOutputFile); } catch { /* ok */ }
      }
    }
  }

  onProgress?.(90, 'Формирую результат...');

  const data = await ffmpeg.readFile(resultFile);
  try { await ffmpeg.deleteFile(resultFile); } catch { /* ok */ }

  let blobData: ArrayBuffer;
  if (data instanceof Uint8Array) {
    const copy = new Uint8Array(data.byteLength);
    copy.set(data);
    blobData = copy.buffer as ArrayBuffer;
  } else {
    blobData = new TextEncoder().encode(data as string).buffer as ArrayBuffer;
  }

  onProgress?.(100, 'Готово!');
  return new Blob([blobData], { type: 'video/mp4' });
}
