import { useEffect, useCallback, useState } from 'react';

import Header from '../components/Header';
import MediaPanel from '../components/MediaPanel';
import PreviewPanel from '../components/PreviewPanel';
import PropertiesPanel from '../components/PropertiesPanel';
import Timeline from '../components/Timeline';
import { useEditorStore } from '../store/editor-store';
import { FolderOpen, Monitor, Sliders } from 'lucide-react';
import { t, useLang } from '../lib/i18n';
import { useMobileLayout } from '../lib/use-mobile';

export default function EditorPage() {
  const isPlaying = useEditorStore((s) => s.playback.playing);
  const setPlaying = useEditorStore((s) => s.setPlaying);
  const currentTime = useEditorStore((s) => s.playback.currentTime);
  const setCurrentTime = useEditorStore((s) => s.setCurrentTime);
  const selectedClipIds = useEditorStore((s) => s.selectedClipIds);
  const selectedTextId = useEditorStore((s) => s.selectedTextId);
  const removeClip = useEditorStore((s) => s.removeClip);
  const removeTextItem = useEditorStore((s) => s.removeTextItem);
  const splitClip = useEditorStore((s) => s.splitClip);
  const deselectAll = useEditorStore((s) => s.deselectAll);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const pushHistory = useEditorStore((s) => s.pushHistory);
  const addTextItem = useEditorStore((s) => s.addTextItem);
  const selectText = useEditorStore((s) => s.selectText);
  const tracks = useEditorStore((s) => s.tracks);
  const totalDuration = useEditorStore((s) => s.totalDuration);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT';

      // Space = play / pause
      if (e.code === 'Space' && !isInput) {
        e.preventDefault();
        setPlaying(!isPlaying);
        return;
      }

      // Ctrl+Z
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ' && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      // Ctrl+Y / Ctrl+Shift+Z
      if (
        (e.ctrlKey || e.metaKey) &&
        (e.code === 'KeyY' || (e.code === 'KeyZ' && e.shiftKey))
      ) {
        e.preventDefault();
        redo();
        return;
      }

      if (isInput) return;

      // Delete
      if (e.code === 'Delete' || e.code === 'Backspace') {
        e.preventDefault();
        pushHistory();
        selectedClipIds.forEach((id) => removeClip(id));
        if (selectedTextId) removeTextItem(selectedTextId);
        return;
      }

      // S = split at playhead
      if (e.code === 'KeyS' && !e.ctrlKey) {
        e.preventDefault();
        if (selectedClipIds.size > 0) {
          pushHistory();
          selectedClipIds.forEach((id) => splitClip(id, currentTime));
        }
        return;
      }

      // Escape = deselect
      if (e.code === 'Escape') {
        deselectAll();
        return;
      }

      // T = add text
      if (e.code === 'KeyT' && !e.ctrlKey) {
        e.preventDefault();
        const textTrack = tracks.find((t) => t.kind === 'text');
        if (textTrack) {
          pushHistory();
          const newId = addTextItem({
            trackId: textTrack.id,
            startOnTimeline: currentTime,
            duration: 3,
          });
          selectText(newId);
        }
        return;
      }

      // Arrow keys = seek
      if (e.code === 'ArrowLeft') {
        e.preventDefault();
        setCurrentTime(Math.max(0, currentTime - (e.shiftKey ? 0.1 : 1)));
        return;
      }
      if (e.code === 'ArrowRight') {
        e.preventDefault();
        setCurrentTime(
          Math.min(totalDuration(), currentTime + (e.shiftKey ? 0.1 : 1)),
        );
        return;
      }
      if (e.code === 'Home') {
        e.preventDefault();
        setCurrentTime(0);
      }
      if (e.code === 'End') {
        e.preventDefault();
        setCurrentTime(totalDuration());
      }
    },
    [
      isPlaying,
      setPlaying,
      undo,
      redo,
      selectedClipIds,
      selectedTextId,
      removeClip,
      removeTextItem,
      splitClip,
      deselectAll,
      currentTime,
      setCurrentTime,
      pushHistory,
      addTextItem,
      selectText,
      tracks,
      totalDuration,
    ],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Mobile panel tab state
  const [mobileTab, setMobileTab] = useState<'media' | 'preview' | 'properties'>('preview');
  const { isMobile, isLandscape, isPortrait } = useMobileLayout();
  useLang(); // re-render on language change

  return (
    <div className="h-screen flex flex-col bg-surface text-gray-100 overflow-hidden">
      <Header />

      {/* ── Desktop layout (md+) ── */}
      {!isMobile && (
        <div className="flex flex-1 min-h-0 overflow-hidden">
          <MediaPanel />
          <div className="flex-1 min-w-0 flex flex-col">
            <PreviewPanel />
          </div>
          <PropertiesPanel />
        </div>
      )}

      {/* ── Mobile PORTRAIT layout ── */}
      {isPortrait && (
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
          {/* Tab bar */}
          <div className="flex border-b border-white/5 bg-surface-50 flex-shrink-0">
            {([
              { key: 'media' as const, icon: FolderOpen, label: t('tabMedia') },
              { key: 'preview' as const, icon: Monitor, label: t('tabPreview') },
              { key: 'properties' as const, icon: Sliders, label: t('tabProperties') },
            ]).map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                onClick={() => setMobileTab(key)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors ${
                  mobileTab === key
                    ? 'text-accent-light border-b-2 border-accent-light bg-accent/10'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 min-h-0 overflow-hidden">
            {mobileTab === 'media' && <MediaPanel mobile />}
            {mobileTab === 'preview' && (
              <div className="flex-1 min-h-0 flex flex-col h-full">
                <PreviewPanel />
              </div>
            )}
            {mobileTab === 'properties' && <PropertiesPanel mobile />}
          </div>
        </div>
      )}

      {/* ── Mobile LANDSCAPE layout ── */}
      {isLandscape && (
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left: compact sidebar with tabs for media / properties */}
          <div className="w-48 flex-shrink-0 flex flex-col border-r border-white/5 bg-surface-50 min-h-0">
            <div className="flex border-b border-white/5 flex-shrink-0">
              {([
                { key: 'media' as const, icon: FolderOpen, label: t('tabMedia') },
                { key: 'properties' as const, icon: Sliders, label: t('tabProperties') },
              ]).map(({ key, icon: Icon, label }) => (
                <button
                  key={key}
                  onClick={() => setMobileTab(key)}
                  className={`flex-1 flex items-center justify-center gap-1 py-1.5 text-[10px] font-medium transition-colors ${
                    (mobileTab === key || (mobileTab === 'preview' && key === 'media'))
                      ? 'text-accent-light border-b-2 border-accent-light bg-accent/10'
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  <Icon size={12} />
                  {label}
                </button>
              ))}
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">
              {(mobileTab === 'media' || mobileTab === 'preview') && <MediaPanel mobile />}
              {mobileTab === 'properties' && <PropertiesPanel mobile />}
            </div>
          </div>

          {/* Right: preview fills remaining space */}
          <div className="flex-1 min-w-0 flex flex-col min-h-0">
            <PreviewPanel />
          </div>
        </div>
      )}

      <Timeline />
    </div>
  );
}
