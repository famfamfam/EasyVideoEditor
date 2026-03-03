/**
 * MediaPanel — left sidebar: media library + audio browser.
 */
import { useEditorStore, uid } from '../store/editor-store';
import { fmtTime } from '../lib/media-utils';
import { Film, Music, Image, X, Plus, FolderOpen, PlusCircle } from 'lucide-react';
import { useCallback, useState, useRef } from 'react';
import type { MediaFile } from '../types';
import { importFiles } from '../lib/media-utils';
import { t, useLang } from '../lib/i18n';
import { useMobileLayout } from '../lib/use-mobile';

interface MediaPanelProps {
  onImport?: () => void;
  mobile?: boolean;
}

export default function MediaPanel({ onImport, mobile }: MediaPanelProps) {
  const media = useEditorStore((s) => s.media);
  const addMedia = useEditorStore((s) => s.addMedia);
  const removeMedia = useEditorStore((s) => s.removeMedia);
  const addClip = useEditorStore((s) => s.addClip);
  const tracks = useEditorStore((s) => s.tracks);
  const clips = useEditorStore((s) => s.clips);
  useLang(); // re-render on language change
  const { isMobile } = useMobileLayout();

  const [filter, setFilter] = useState<'all' | 'video' | 'audio' | 'image'>('all');

  const handleImport = useCallback(() => {
    if (onImport) { onImport(); return; }
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'video/*,audio/*,image/*';
    input.onchange = async () => {
      if (!input.files?.length) return;
      const imported = await importFiles(input.files);
      addMedia(imported);
    };
    input.click();
  }, [onImport, addMedia]);

  const quickAddToTimeline = useCallback(
    (m: MediaFile) => {
      const kind = m.type === 'audio' ? 'audio' : 'video';
      const matchingTracks = tracks.filter((t) => t.kind === kind);
      if (matchingTracks.length === 0) return;

      // Pick the track whose last clip ends earliest (spreads clips across tracks)
      let bestTrack = matchingTracks[0];
      let bestEnd = Infinity;
      for (const trk of matchingTracks) {
        const trackClips = clips.filter((c) => c.trackId === trk.id);
        const endTime = trackClips.length > 0
          ? Math.max(...trackClips.map((c) => c.startOnTimeline + c.duration))
          : 0;
        if (endTime < bestEnd) {
          bestEnd = endTime;
          bestTrack = trk;
        }
      }

      const startAt = bestEnd === Infinity ? 0 : bestEnd;

      addClip({
        trackId: bestTrack.id, mediaId: m.id, startOnTimeline: startAt,
        duration: m.duration, sourceStart: 0, sourceEnd: m.duration,
        speed: 1, volume: 1, fadeIn: 0, fadeOut: 0,
      });
    },
    [tracks, clips, addClip],
  );

  const onDragStart = useCallback((e: React.DragEvent, m: MediaFile) => {
    e.dataTransfer.setData('application/x-media-id', m.id);
    e.dataTransfer.effectAllowed = 'copy';
  }, []);

  const iconForType = (type: MediaFile['type']) => {
    if (type === 'video') return <Film size={14} className="text-purple-400" />;
    if (type === 'audio') return <Music size={14} className="text-blue-400" />;
    return <Image size={14} className="text-amber-400" />;
  };

  const filtered = filter === 'all' ? media : media.filter((m) => m.type === filter);

  return (
    <aside className={mobile ? 'flex flex-col h-full bg-surface-50' : 'w-56 xl:w-64 flex-shrink-0 flex flex-col border-r border-white/5 bg-surface-50'}>
      <div className="px-3 py-2 flex items-center justify-between border-b border-white/5">
        <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{t('mediaLibrary')}</span>
        <button onClick={handleImport} className="p-1 text-gray-400 hover:text-white hover:bg-white/10 rounded transition-colors" title={t('importFiles')}>
          <Plus size={14} />
        </button>
      </div>

      {/* Type filter tabs */}
      {media.length > 0 && (
        <div className="flex gap-1 px-2 py-1.5 border-b border-white/5">
          {(['all', 'video', 'audio', 'image'] as const).map((kind) => (
            <button key={kind} onClick={() => setFilter(kind)}
              className={`text-[10px] px-2 py-0.5 rounded-full transition-colors ${filter === kind ? 'bg-accent text-white' : 'text-gray-500 hover:bg-white/5'}`}>
              {kind === 'all' ? t('filterAll') : kind === 'video' ? t('filterVideo') : kind === 'audio' ? t('filterAudio') : t('filterImage')}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {media.length === 0 ? (
          <button onClick={handleImport}
            className="w-full flex flex-col items-center justify-center py-10 text-gray-500 hover:text-purple-400 transition-colors group">
            <FolderOpen size={32} className="mb-2 text-gray-600 group-hover:text-purple-400" />
            <p className="text-xs font-medium">{t('importFiles')}</p>
            <p className="text-[10px] text-gray-600 mt-0.5">{t('videoAudioImages')}</p>
          </button>
        ) : (
          filtered.map((m) => (
            <div key={m.id} draggable={!isMobile} onDragStart={(e) => onDragStart(e, m)}
              onDoubleClick={() => quickAddToTimeline(m)}
              className="group flex items-center gap-2 p-1.5 rounded-lg hover:bg-white/5 cursor-grab active:cursor-grabbing transition-colors"
              title={isMobile ? undefined : `${m.name}\n${t('doubleClickHint')}`}>
              <div className="w-12 h-8 rounded bg-surface-200 flex-shrink-0 overflow-hidden flex items-center justify-center">
                {m.thumbnail ? (
                  <img src={m.thumbnail} alt="" className="w-full h-full object-cover" />
                ) : (
                  iconForType(m.type)
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-gray-300 truncate">{m.name}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  {iconForType(m.type)}
                  <span className="text-[10px] text-gray-500">{fmtTime(m.duration)}</span>
                </div>
              </div>
              {isMobile && (
                <button
                  onClick={(e) => { e.stopPropagation(); quickAddToTimeline(m); }}
                  className="p-1.5 text-accent-light hover:text-white hover:bg-accent/20 rounded-lg transition-colors flex-shrink-0"
                  title={t('tapToAdd')}
                  style={{ minHeight: 'auto', minWidth: 'auto' }}
                >
                  <PlusCircle size={18} />
                </button>
              )}
              <button onClick={(e) => { e.stopPropagation(); removeMedia(m.id); }}
                className="p-0.5 text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0" title={t('removeMedia')}
                style={isMobile ? { opacity: 1 } : undefined}>
                <X size={12} />
              </button>
            </div>
          ))
        )}
      </div>

      {media.length > 0 && (
        <div className="px-3 py-2 border-t border-white/5 text-[10px] text-gray-500">
          {media.length} {t('statsFiles')} • {media.filter((m) => m.type === 'video').length} {t('statsVideo')} •{' '}
          {media.filter((m) => m.type === 'audio').length} {t('statsAudio')}
        </div>
      )}
    </aside>
  );
}
