/**
 * Media utilities — probe files, generate thumbnails, import.
 */
import { uid } from '../store/editor-store';
import type { MediaFile } from '../types';

export function probeDuration(url: string): Promise<number> {
  return new Promise((resolve) => {
    const el = document.createElement('video');
    el.preload = 'metadata';
    el.muted = true;
    el.src = url;
    el.onloadedmetadata = () => {
      const d = Number.isFinite(el.duration) ? el.duration : 10;
      el.removeAttribute('src');
      el.load();
      resolve(d);
    };
    el.onerror = () => {
      el.removeAttribute('src');
      el.load();
      resolve(10);
    };
  });
}

export function probeAudioDuration(url: string): Promise<number> {
  return new Promise((resolve) => {
    const el = document.createElement('audio');
    el.preload = 'metadata';
    el.src = url;
    el.onloadedmetadata = () => {
      const d = Number.isFinite(el.duration) ? el.duration : 10;
      el.removeAttribute('src');
      el.load();
      resolve(d);
    };
    el.onerror = () => {
      el.removeAttribute('src');
      el.load();
      resolve(10);
    };
  });
}

export function probeDimensions(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const el = document.createElement('video');
    el.preload = 'metadata';
    el.muted = true;
    el.src = url;
    el.onloadedmetadata = () => {
      resolve({ width: el.videoWidth || 1280, height: el.videoHeight || 720 });
      el.removeAttribute('src');
      el.load();
    };
    el.onerror = () => {
      resolve({ width: 1280, height: 720 });
      el.removeAttribute('src');
      el.load();
    };
  });
}

export function generateThumbnail(url: string, time = 0.5, w = 160, h = 90): Promise<string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';
    video.src = url;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;

    video.onloadeddata = () => {
      video.currentTime = Math.min(time, video.duration * 0.1);
    };
    video.onseeked = () => {
      ctx.drawImage(video, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.6));
      video.removeAttribute('src');
      video.load();
    };
    video.onerror = () => {
      reject(new Error('Thumbnail generation failed'));
      video.removeAttribute('src');
      video.load();
    };
  });
}

export function generateFilmstrip(url: string, count = 8, w = 80, h = 45): Promise<string[]> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';
    video.src = url;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;

    const frames: string[] = [];
    let idx = 0;

    video.onloadeddata = () => {
      const step = video.duration / count;
      video.currentTime = step * 0.5;
    };

    video.onseeked = () => {
      ctx.drawImage(video, 0, 0, w, h);
      frames.push(canvas.toDataURL('image/jpeg', 0.5));
      idx++;
      if (idx < count) {
        const step = video.duration / count;
        video.currentTime = step * (idx + 0.5);
      } else {
        video.removeAttribute('src');
        video.load();
        resolve(frames);
      }
    };

    video.onerror = () => {
      video.removeAttribute('src');
      video.load();
      resolve(frames);
    };
  });
}

export async function importFiles(fileList: FileList): Promise<MediaFile[]> {
  const results: MediaFile[] = [];

  for (const file of Array.from(fileList)) {
    const url = URL.createObjectURL(file);
    let type: 'video' | 'audio' | 'image';

    if (file.type.startsWith('video/')) type = 'video';
    else if (file.type.startsWith('audio/')) type = 'audio';
    else if (file.type.startsWith('image/')) type = 'image';
    else continue;

    let duration = 5;
    let width: number | undefined;
    let height: number | undefined;
    let thumbnail: string | undefined;
    let filmstrip: string[] | undefined;

    try {
      if (type === 'video') {
        duration = await probeDuration(url);
        const dims = await probeDimensions(url);
        width = dims.width;
        height = dims.height;
        try { thumbnail = await generateThumbnail(url); } catch { /* ok */ }
        try { filmstrip = await generateFilmstrip(url); } catch { /* ok */ }
      } else if (type === 'audio') {
        duration = await probeAudioDuration(url);
      } else {
        duration = 5;
        const img = new Image();
        img.src = url;
        await new Promise<void>((r) => { img.onload = () => r(); img.onerror = () => r(); });
        width = img.naturalWidth || 1280;
        height = img.naturalHeight || 720;
        thumbnail = url;
      }
    } catch { /* use defaults */ }

    results.push({
      id: uid('m'),
      name: file.name,
      type,
      url,
      file,
      duration: Math.round(duration * 100) / 100,
      width,
      height,
      thumbnail,
      filmstrip,
    });
  }

  return results;
}

export function fmtTime(sec: number): string {
  if (sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}:${s.toFixed(1).padStart(4, '0')}` : `${s.toFixed(1)}с`;
}

export function fmtTimecode(sec: number, _fps = 30): string {
  if (sec < 0) sec = 0;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 100);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
}

export function fmtFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}
