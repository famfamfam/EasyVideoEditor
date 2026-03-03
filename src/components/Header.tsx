/**
 * Header — top toolbar with project name, undo/redo, export.
 */
import { Undo2, Redo2, Download, Film, Loader2, Plus, Play, X } from 'lucide-react';
import { useEditorStore } from '../store/editor-store';
import { fmtTimecode, fmtFileSize } from '../lib/media-utils';
import { useCallback, useRef, useState } from 'react';
import { exportProject, type ExportInput } from '../lib/export-engine';
import { resetFFmpeg } from '../lib/ffmpeg';
import { t, useLang } from '../lib/i18n';
import LanguageSwitcher from './LanguageSwitcher';

interface HeaderProps {
  onImport?: () => void;
}

export default function Header({ onImport }: HeaderProps) {
  const project = useEditorStore((s) => s.project);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const clips = useEditorStore((s) => s.clips);
  const tracks = useEditorStore((s) => s.tracks);
  const media = useEditorStore((s) => s.media);
  const transitions = useEditorStore((s) => s.transitions);
  const textItems = useEditorStore((s) => s.textItems);
  const exportSettings = useEditorStore((s) => s.exportSettings);
  const exporting = useEditorStore((s) => s.exporting);
  const exportProgress = useEditorStore((s) => s.exportProgress);
  const exportMessage = useEditorStore((s) => s.exportMessage);
  const setExportState = useEditorStore((s) => s.setExportState);
  const playback = useEditorStore((s) => s.playback);
  const totalDuration = useEditorStore((s) => s.totalDuration);
  useLang(); // re-render on language change

  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultSize, setResultSize] = useState(0);
  const [showPreview, setShowPreview] = useState(false);

  const handleExport = useCallback(async () => {
    if ((clips.length === 0 && textItems.length === 0) || exporting) return;
    setExportState(true, 0, t('exportPreparing'));

    try {
      const input: ExportInput = {
        clips,
        textItems,
        tracks,
        transitions,
        settings: exportSettings,
        media: media.map((m) => ({ id: m.id, url: m.url, type: m.type, file: m.file, duration: m.duration })),
      };
      const blob = await exportProject(input, (p: number, msg: string) => setExportState(true, p, msg));
      const url = URL.createObjectURL(blob);
      setResultUrl(url);
      setResultSize(blob.size);
      setExportState(false, 100, t('exportDone'));
      setShowPreview(true);
    } catch (err) {
      console.error('[Export]', err);
      resetFFmpeg(); // discard potentially crashed WASM instance
      setExportState(false, 0, err instanceof Error ? err.message : t('exportError'));
    }
  }, [clips, tracks, media, textItems, transitions, exportSettings, exporting, setExportState]);

  const handleDownload = useCallback(() => {
    if (!resultUrl) return;
    const a = document.createElement('a');
    a.href = resultUrl;
    a.download = `${project.name || 'video'}_${Date.now()}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [resultUrl, project.name]);

  const handleImport = useCallback(() => {
    if (onImport) {
      onImport();
      return;
    }
    // Default import via file input
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'video/*,audio/*,image/*';
    input.onchange = async () => {
      if (!input.files?.length) return;
      const { importFiles } = await import('../lib/media-utils');
      const imported = await importFiles(input.files!);
      useEditorStore.getState().addMedia(imported);
    };
    input.click();
  }, [onImport]);

  return (
    <header className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-2 bg-surface-50 border-b border-white/5 flex-shrink-0 overflow-x-auto">
      <div className="flex items-center gap-2 mr-1 sm:mr-2 cursor-pointer flex-shrink-0" onClick={() => window.location.href = 'https://6io.io'}>
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center">
          <Film size={14} />
        </div>
        <span className="text-sm font-bold hidden sm:inline">{t('appName')}</span>
      </div>

      <button onClick={handleImport}
        className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 text-xs font-medium bg-accent/20 hover:bg-accent/30 text-accent-light rounded-lg transition-colors flex-shrink-0">
        <Plus size={14} /> <span className="hidden xs:inline">{t('import')}</span>
      </button>

      <div className="flex items-center gap-0.5 ml-1 sm:ml-2 flex-shrink-0">
        <button onClick={undo} className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded transition-colors" title={t('undo')}>
          <Undo2 size={16} />
        </button>
        <button onClick={redo} className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded transition-colors" title={t('redo')}>
          <Redo2 size={16} />
        </button>
      </div>

      <div className="ml-auto flex items-center gap-1 sm:gap-3 text-xs text-gray-400 flex-shrink-0">
        <span className="font-mono text-[10px] sm:text-xs">{fmtTimecode(playback.currentTime)}</span>
        <span className="hidden sm:inline">/</span>
        <span className="font-mono text-[10px] sm:text-xs hidden sm:inline">{fmtTimecode(totalDuration())}</span>
      </div>

      <LanguageSwitcher />

      <div className="flex items-center gap-1 sm:gap-2 ml-1 sm:ml-2 flex-shrink-0">
        {exporting && (
          <div className="flex items-center gap-1 sm:gap-2 text-xs text-purple-300">
            <Loader2 size={14} className="animate-spin" />
            <span className="hidden sm:inline">{exportMessage}</span>
            <span className="font-bold">{exportProgress}%</span>
          </div>
        )}

        {resultUrl && !exporting && (
          <>
            <button onClick={() => setShowPreview(true)}
              className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors">
              <Play size={14} /> <span className="hidden sm:inline">{t('preview')}</span>
            </button>
            <button onClick={handleDownload}
              className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 text-xs font-semibold bg-green-600 hover:bg-green-500 rounded-lg transition-colors">
              <Download size={14} /> <span className="hidden sm:inline">{t('download')} ({fmtFileSize(resultSize)})</span>
            </button>
          </>
        )}

        <button onClick={handleExport}
          disabled={(clips.length === 0 && textItems.length === 0) || exporting}
          className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-4 py-1.5 text-xs font-semibold bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed">
          {exporting ? (<><Loader2 size={14} className="animate-spin" /> <span className="hidden sm:inline">{t('exporting')}</span></>) : (<><Download size={14} /> <span className="hidden sm:inline">{t('export')}</span></>)}
        </button>
      </div>

      {/* Preview modal */}
      {showPreview && resultUrl && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowPreview(false)}>
          <div className="relative bg-surface-100 rounded-t-xl sm:rounded-xl shadow-2xl border border-white/10 max-w-4xl w-full sm:mx-4 overflow-hidden max-h-[90vh] sm:max-h-none" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-3 sm:px-4 py-3 border-b border-white/10">
              <span className="text-sm font-semibold text-gray-200">{t('previewTitle')}</span>
              <div className="flex items-center gap-2">
                <button onClick={handleDownload}
                  className="flex items-center gap-1.5 px-2 sm:px-3 py-1 text-xs font-medium bg-green-600 hover:bg-green-500 rounded-lg transition-colors">
                  <Download size={12} /> <span className="hidden sm:inline">{t('download')}</span> ({fmtFileSize(resultSize)})
                </button>
                <button onClick={() => setShowPreview(false)} className="p-1 text-gray-400 hover:text-white rounded transition-colors">
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="p-2 sm:p-4 flex justify-center bg-black">
              <video
                src={resultUrl}
                controls
                autoPlay
                className="max-w-full max-h-[60vh] sm:max-h-[70vh] rounded"
                style={{ aspectRatio: `${project.width}/${project.height}` }}
              />
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
