/**
 * PreviewPanel — center area: canvas preview with transport controls.
 */
import { useRef, useEffect, useCallback } from 'react';
import { Play, Pause, SkipBack, SkipForward, Camera, ChevronLeft, ChevronRight } from 'lucide-react';
import { useEditorStore } from '../store/editor-store';
import { PreviewEngine } from '../lib/preview-engine';
import { fmtTimecode } from '../lib/media-utils';
import { t, useLang } from '../lib/i18n';

export default function PreviewPanel() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<PreviewEngine | null>(null);

  const clips = useEditorStore((s) => s.clips);
  const tracks = useEditorStore((s) => s.tracks);
  const media = useEditorStore((s) => s.media);
  const textItems = useEditorStore((s) => s.textItems);
  const transitions = useEditorStore((s) => s.transitions);
  const project = useEditorStore((s) => s.project);
  const playing = useEditorStore((s) => s.playback.playing);
  const currentTime = useEditorStore((s) => s.playback.currentTime);
  const setPlaying = useEditorStore((s) => s.setPlaying);
  const setCurrentTime = useEditorStore((s) => s.setCurrentTime);
  const totalDuration = useEditorStore((s) => s.totalDuration);

  const mediaMap = useRef(new Map<string, (typeof media)[0]>());
  useEffect(() => { mediaMap.current = new Map(media.map((m) => [m.id, m])); }, [media]);

  const internalTimeUpdate = useRef(false);

  useEffect(() => {
    if (!canvasRef.current) return;
    engineRef.current = new PreviewEngine(
      canvasRef.current, project.width, project.height,
      (time) => { internalTimeUpdate.current = true; setCurrentTime(time); },
      () => setPlaying(false),
    );
    return () => engineRef.current?.destroy();
  }, [project.width, project.height]);

  useEffect(() => {
    engineRef.current?.setTextItems(textItems);
    if (!playing && engineRef.current) {
      engineRef.current.seek(currentTime, clips, tracks, mediaMap.current, textItems);
    }
  }, [textItems]);

  useEffect(() => {
    engineRef.current?.setTransitions(transitions);
    if (!playing && engineRef.current) {
      engineRef.current.seek(currentTime, clips, tracks, mediaMap.current, textItems);
    }
  }, [transitions]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (playing) engine.play(clips, tracks, mediaMap.current, totalDuration(), textItems);
    else engine.pause();
  }, [playing]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (internalTimeUpdate.current) { internalTimeUpdate.current = false; return; }
    engine.seek(currentTime, clips, tracks, mediaMap.current, textItems);
  }, [currentTime]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (playing) {
      engine.updateLiveData(clips, tracks, mediaMap.current, transitions);
    } else {
      engine.seek(currentTime, clips, tracks, mediaMap.current, textItems);
    }
  }, [clips, tracks, transitions]);

  const togglePlay = useCallback(() => setPlaying(!playing), [playing, setPlaying]);
  const skipBack = useCallback(() => { setPlaying(false); setCurrentTime(0); }, [setPlaying, setCurrentTime]);
  const skipForward = useCallback(() => { setPlaying(false); setCurrentTime(totalDuration()); }, [setPlaying, setCurrentTime, totalDuration]);
  const stepBack = useCallback(() => setCurrentTime(Math.max(0, currentTime - 0.1)), [currentTime, setCurrentTime]);
  const stepForward = useCallback(() => setCurrentTime(currentTime + 0.1), [currentTime, setCurrentTime]);

  const captureFrame = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine) return;
    try {
      const blob = await engine.captureFrame();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `frame_${currentTime.toFixed(2)}s.png`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) { console.error('Capture failed:', err); }
  }, [currentTime]);

  const dur = totalDuration();
  const hasContent = clips.length > 0 || textItems.length > 0;
  useLang();

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-surface">
      <div className="flex-1 flex items-center justify-center bg-black/50 min-h-0 p-2 relative">
        <canvas ref={canvasRef}
          className="max-w-full max-h-full rounded-lg bg-black"
          style={{ aspectRatio: `${project.width}/${project.height}` }} />
        {!hasContent && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center text-gray-500">
              <p className="text-lg font-medium mb-1">{t('previewEmpty')}</p>
              <p className="text-sm">{t('previewEmptyHint')}</p>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 px-4 py-2 bg-surface-50 border-t border-white/5">
        <button onClick={skipBack} className="p-1.5 text-gray-400 hover:text-white rounded transition-colors" title={t('previewSkipBack')}>
          <SkipBack size={16} />
        </button>
        <button onClick={stepBack} className="p-1 text-gray-400 hover:text-white rounded transition-colors" title={t('previewStepBack')}>
          <ChevronLeft size={16} />
        </button>
        <button onClick={togglePlay}
          className="p-2 bg-accent hover:bg-accent-light rounded-full transition-colors"
          title={playing ? t('previewPause') : t('previewPlay')}>
          {playing ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
        </button>
        <button onClick={stepForward} className="p-1 text-gray-400 hover:text-white rounded transition-colors" title={t('previewStepForward')}>
          <ChevronRight size={16} />
        </button>
        <button onClick={skipForward} className="p-1.5 text-gray-400 hover:text-white rounded transition-colors" title={t('previewSkipForward')}>
          <SkipForward size={16} />
        </button>
        <div className="ml-3 text-xs font-mono text-gray-400">
          {fmtTimecode(currentTime)} <span className="text-gray-600">/</span> {fmtTimecode(dur)}
        </div>
        <div className="flex-1" />
        <button onClick={captureFrame} className="p-1.5 text-gray-400 hover:text-white rounded transition-colors" title={t('previewCaptureFrame')}>
          <Camera size={16} />
        </button>
        <span className="text-[10px] text-gray-500">{project.width}×{project.height}</span>
      </div>
    </div>
  );
}
