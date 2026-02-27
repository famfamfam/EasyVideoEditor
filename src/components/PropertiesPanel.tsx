/**
 * PropertiesPanel — right sidebar: edit selected clip or text properties.
 */
import { useMemo } from 'react';
import { Sliders, Clock, Volume2, Zap, Film, Music, Sparkles, Type, Move, Palette, Layers, AudioLines } from 'lucide-react';
import { useEditorStore } from '../store/editor-store';
import { fmtTime } from '../lib/media-utils';
import type { Clip, ClipEffects, TextItem, TransitionType } from '../types';
import { t, useLang } from '../lib/i18n';

export default function PropertiesPanel() {
  const clips = useEditorStore((s) => s.clips);
  const media = useEditorStore((s) => s.media);
  const selectedClipIds = useEditorStore((s) => s.selectedClipIds);
  const selectedTextId = useEditorStore((s) => s.selectedTextId);
  const textItems = useEditorStore((s) => s.textItems);
  const updateClip = useEditorStore((s) => s.updateClip);
  const updateTextItem = useEditorStore((s) => s.updateTextItem);
  const tracks = useEditorStore((s) => s.tracks);
  const transitions = useEditorStore((s) => s.transitions);
  const addTransition = useEditorStore((s) => s.addTransition);
  const removeTransition = useEditorStore((s) => s.removeTransition);
  const extractAudio = useEditorStore((s) => s.extractAudio);
  const pushHistory = useEditorStore((s) => s.pushHistory);

  const selectedClips = useMemo(() => clips.filter((c) => selectedClipIds.has(c.id)), [clips, selectedClipIds]);
  const selectedText = useMemo(() => textItems.find((t) => t.id === selectedTextId) ?? null, [textItems, selectedTextId]);

  // Always compute these — hooks must run in the same order every render
  const clip = selectedClips.length === 1 ? selectedClips[0] : null;

  const sameTrackClips = useMemo(() => {
    if (!clip) return [];
    return clips
      .filter((c) => c.trackId === clip.trackId && c.id !== clip.id)
      .sort((a, b) => a.startOnTimeline - b.startOnTimeline);
  }, [clips, clip?.trackId, clip?.id]);

  const prevClip = useMemo(() => {
    if (!clip) return null;
    return sameTrackClips.filter((c) => c.startOnTimeline + c.duration <= clip.startOnTimeline + 0.5).pop() ?? null;
  }, [sameTrackClips, clip?.startOnTimeline]);

  const nextClip = useMemo(() => {
    if (!clip) return null;
    return sameTrackClips.find((c) => c.startOnTimeline >= clip.startOnTimeline + clip.duration - 0.5) ?? null;
  }, [sameTrackClips, clip?.startOnTimeline, clip?.duration]);

  const clipTransitions = useMemo(() => {
    if (!clip) return [];
    return transitions.filter((t) => t.clipAId === clip.id || t.clipBId === clip.id);
  }, [transitions, clip?.id]);
  useLang(); // re-render on language change
  const TRANSITION_OPTIONS = getTransitionOptions();

  // --- early returns after all hooks ---

  if (selectedText) return <TextProperties text={selectedText} updateTextItem={updateTextItem} />;

  if (!clip || selectedClips.length === 0) {
    return (
      <aside className="w-64 bg-surface-50 border-l border-white/5 flex flex-col items-center justify-center text-gray-500 text-xs p-4">
        <Sliders size={24} className="mb-2 text-gray-600" />
        <p className="text-center" style={{ whiteSpace: 'pre-line' }}>{t('selectClipHint')}</p>
      </aside>
    );
  }

  if (selectedClips.length > 1) {
    return (
      <aside className="w-64 bg-surface-50 border-l border-white/5 flex flex-col items-center justify-center text-gray-500 text-xs p-4">
        <Sliders size={24} className="mb-2 text-gray-600" />
        {t('selectedClips')}: {selectedClips.length}
      </aside>
    );
  }

  const mf = media.find((m) => m.id === clip.mediaId);
  const track = tracks.find((t) => t.id === clip.trackId);
  const isAudio = track?.kind === 'audio' || mf?.type === 'audio';
  const isVideo = mf?.type === 'video';

  const update = (patch: Partial<Clip>) => updateClip(clip.id, patch);
  const updateEffect = (key: keyof ClipEffects, value: number) => {
    update({ effects: { ...clip.effects, [key]: value } });
  };
  const fx = clip.effects ?? {};

  return (
    <aside className="w-64 bg-surface-50 border-l border-white/5 flex flex-col overflow-y-auto">
      <div className="p-3 border-b border-white/5 flex items-center gap-2">
        {isAudio ? <Music size={14} className="text-green-400" /> : <Film size={14} className="text-accent" />}
        <span className="text-xs font-medium text-gray-200 truncate">{mf?.name ?? t('clip')}</span>
      </div>

      <div className="p-3 space-y-4 text-xs">
        {/* Timing */}
        <Section icon={Clock} label={t('sectionTime')}>
          <Row label={t('rowStart')}>
            <NumberInput value={clip.startOnTimeline} step={0.1} min={0} onChange={(v) => update({ startOnTimeline: v })} format={fmtTime} />
          </Row>
          <Row label={t('rowDuration')}>
            <NumberInput value={clip.duration} step={0.1} min={0.1} onChange={(v) => update({ duration: v })} format={fmtTime} />
          </Row>
          <Row label={t('rowSourceFrom')}>
            <NumberInput value={clip.sourceStart} step={0.1} min={0} onChange={(v) => update({ sourceStart: v })} format={fmtTime} />
          </Row>
          <Row label={t('rowSourceTo')}>
            <NumberInput value={clip.sourceEnd} step={0.1} min={clip.sourceStart + 0.1} onChange={(v) => update({ sourceEnd: v })} format={fmtTime} />
          </Row>
        </Section>

        {/* Speed */}
        <Section icon={Zap} label={t('sectionSpeed')}>
          <Row label={`${clip.speed.toFixed(2)}×`}>
            <input type="range" min={0.25} max={4} step={0.25} value={clip.speed}
              onChange={(e) => update({ speed: Number(e.target.value) })} className="w-full" />
          </Row>
          <div className="flex gap-1 flex-wrap">
            {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4].map((s) => (
              <button key={s} onClick={() => update({ speed: s })}
                className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${clip.speed === s ? 'bg-accent text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>
                {s}×
              </button>
            ))}
          </div>
        </Section>

        {/* Volume / Fades */}
        <Section icon={Volume2} label={t('sectionAudio')}>
          <Row label={`${t('rowVolume')} ${Math.round(clip.volume * 100)}%`}>
            <input type="range" min={0} max={2} step={0.05} value={clip.volume}
              onChange={(e) => update({ volume: Number(e.target.value) })} className="w-full" />
          </Row>
          <div className="flex gap-1">
            {[0, 0.5, 1, 1.5, 2].map((v) => (
              <button key={v} onClick={() => update({ volume: v })}
                className={`flex-1 py-0.5 rounded text-[10px] transition-colors ${clip.volume === v ? 'bg-accent text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>
                {Math.round(v * 100)}%
              </button>
            ))}
          </div>
          <Row label={`${t('rowFadeIn')} ${clip.fadeIn.toFixed(1)}${t('secSuffix')}`}>
            <input type="range" min={0} max={Math.min(5, clip.duration / 2)} step={0.1}
              value={clip.fadeIn} onChange={(e) => update({ fadeIn: Number(e.target.value) })} className="w-full" />
          </Row>
          <Row label={`${t('rowFadeOut')} ${clip.fadeOut.toFixed(1)}${t('secSuffix')}`}>
            <input type="range" min={0} max={Math.min(5, clip.duration / 2)} step={0.1}
              value={clip.fadeOut} onChange={(e) => update({ fadeOut: Number(e.target.value) })} className="w-full" />
          </Row>
        </Section>

        {/* Effects (video only) */}
        {!isAudio && (
          <Section icon={Sparkles} label={t('sectionEffects')}>
            <Row label={`${t('rowBrightness')} ${((fx.brightness ?? 1) * 100).toFixed(0)}%`}>
              <input type="range" min={0} max={2} step={0.05} value={fx.brightness ?? 1}
                onChange={(e) => updateEffect('brightness', Number(e.target.value))} className="w-full" />
            </Row>
            <Row label={`${t('rowContrast')} ${((fx.contrast ?? 1) * 100).toFixed(0)}%`}>
              <input type="range" min={0} max={2} step={0.05} value={fx.contrast ?? 1}
                onChange={(e) => updateEffect('contrast', Number(e.target.value))} className="w-full" />
            </Row>
            <Row label={`${t('rowSaturation')} ${((fx.saturation ?? 1) * 100).toFixed(0)}%`}>
              <input type="range" min={0} max={3} step={0.05} value={fx.saturation ?? 1}
                onChange={(e) => updateEffect('saturation', Number(e.target.value))} className="w-full" />
            </Row>
            <Row label={`${t('rowGrayscale')} ${((fx.grayscale ?? 0) * 100).toFixed(0)}%`}>
              <input type="range" min={0} max={1} step={0.05} value={fx.grayscale ?? 0}
                onChange={(e) => updateEffect('grayscale', Number(e.target.value))} className="w-full" />
            </Row>
            <Row label={`${t('rowSepia')} ${((fx.sepia ?? 0) * 100).toFixed(0)}%`}>
              <input type="range" min={0} max={1} step={0.05} value={fx.sepia ?? 0}
                onChange={(e) => updateEffect('sepia', Number(e.target.value))} className="w-full" />
            </Row>
            <Row label={`${t('rowHue')} ${(fx.hueRotate ?? 0).toFixed(0)}°`}>
              <input type="range" min={0} max={360} step={1} value={fx.hueRotate ?? 0}
                onChange={(e) => updateEffect('hueRotate', Number(e.target.value))} className="w-full" />
            </Row>
            <Row label={`${t('rowOpacity')} ${((fx.opacity ?? 1) * 100).toFixed(0)}%`}>
              <input type="range" min={0} max={1} step={0.05} value={fx.opacity ?? 1}
                onChange={(e) => updateEffect('opacity', Number(e.target.value))} className="w-full" />
            </Row>
            <button onClick={() => update({ effects: undefined })}
              className="w-full mt-1 py-1 px-2 rounded bg-white/5 hover:bg-white/10 text-gray-400 text-[10px]">
              {t('rowResetEffects')}
            </button>
          </Section>
        )}

        {/* Transitions */}
        {!isAudio && (
          <Section icon={Layers} label={t('sectionTransitions')}>
            {clipTransitions.length === 0 && !prevClip && !nextClip && (
              <p className="text-gray-500 text-[10px]">{t('transitionNoneHint')}</p>
            )}
            {clipTransitions.map((tr) => {
              const otherClipId = tr.clipAId === clip.id ? tr.clipBId : tr.clipAId;
              const otherClip = clips.find((c) => c.id === otherClipId);
              const otherName = otherClip ? (media.find((m) => m.id === otherClip.mediaId)?.name ?? t('clip')) : t('clip');
              return (
                <div key={tr.id} className="bg-white/5 rounded p-2 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-300 text-[10px]">↔ {otherName}</span>
                    <button onClick={() => removeTransition(tr.id)} className="text-red-400 hover:text-red-300 text-[10px]">✕</button>
                  </div>
                  <Row label={t('rowTransitionType')}>
                    <select value={tr.type} onChange={(e) => {
                      removeTransition(tr.id);
                      addTransition(tr.clipAId, tr.clipBId, e.target.value as TransitionType, tr.duration);
                    }} className="w-full bg-surface border border-white/10 rounded px-2 py-1 text-gray-200 focus:border-accent/60 outline-none">
                      {TRANSITION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </Row>
                  <Row label={`${t('transitionDuration')} ${tr.duration.toFixed(1)}${t('secSuffix')}`}>
                    <input type="range" min={0.1} max={3} step={0.1} value={tr.duration}
                      onChange={(e) => {
                        removeTransition(tr.id);
                        addTransition(tr.clipAId, tr.clipBId, tr.type, Number(e.target.value));
                      }} className="w-full" />
                  </Row>
                </div>
              );
            })}
            {prevClip && !clipTransitions.some((tr) => (tr.clipAId === prevClip.id && tr.clipBId === clip.id) || (tr.clipAId === clip.id && tr.clipBId === prevClip.id)) && (
              <TransitionAdder label={t('addTransitionToPrev')} onAdd={(type, dur) => {
                pushHistory();
                addTransition(prevClip.id, clip.id, type, dur);
              }} />
            )}
            {nextClip && !clipTransitions.some((tr) => (tr.clipAId === clip.id && tr.clipBId === nextClip.id) || (tr.clipAId === nextClip.id && tr.clipBId === clip.id)) && (
              <TransitionAdder label={t('addTransitionToNext')} onAdd={(type, dur) => {
                pushHistory();
                addTransition(clip.id, nextClip.id, type, dur);
              }} />
            )}
          </Section>
        )}

        {/* Extract Audio */}
        {isVideo && (
          <Section icon={AudioLines} label={t('sectionExtractAudio')}>
            <p className="text-gray-500 text-[10px] mb-1">{t('extractAudioHint')}</p>
            <button onClick={() => { pushHistory(); extractAudio(clip.id); }}
              className="w-full py-1.5 px-2 rounded bg-green-600/30 hover:bg-green-600/50 text-green-300 text-[11px] font-medium transition-colors flex items-center justify-center gap-1.5">
              <AudioLines size={12} /> {t('extractAudioBtn')}
            </button>
          </Section>
        )}
      </div>
    </aside>
  );
}

/* ── Transition helpers ───────────────────────────────────── */
function getTransitionOptions(): { value: TransitionType; label: string }[] {
  return [
    { value: 'crossfade', label: t('trCrossfade') },
    { value: 'fade-black', label: t('trFadeBlack') },
    { value: 'fade-white', label: t('trFadeWhite') },
    { value: 'dissolve', label: t('trDissolve') },
    { value: 'wipe-left', label: t('trWipeLeft') },
    { value: 'wipe-right', label: t('trWipeRight') },
    { value: 'wipe-up', label: t('trWipeUp') },
    { value: 'wipe-down', label: t('trWipeDown') },
    { value: 'slide-left', label: t('trSlideLeft') },
    { value: 'slide-right', label: t('trSlideRight') },
  ];
}

function TransitionAdder({ label, onAdd }: { label: string; onAdd: (type: TransitionType, dur: number) => void }) {
  const opts = getTransitionOptions();
  return (
    <div className="bg-white/5 rounded p-2 space-y-1.5">
      <span className="text-gray-400 text-[10px] block">{label}</span>
      <div className="flex flex-wrap gap-1">
        {opts.map((o) => (
          <button key={o.value} onClick={() => onAdd(o.value, 0.5)}
            className="px-1.5 py-0.5 rounded bg-accent/20 text-accent-light text-[10px] hover:bg-accent/40 transition-colors">
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── Text Properties ─────────────────────────────────────── */
function TextProperties({ text, updateTextItem }: { text: TextItem; updateTextItem: (id: string, patch: Partial<TextItem>) => void }) {
  const update = (patch: Partial<TextItem>) => updateTextItem(text.id, patch);
  useLang();

  return (
    <aside className="w-64 bg-surface-50 border-l border-white/5 flex flex-col overflow-y-auto">
      <div className="p-3 border-b border-white/5 flex items-center gap-2">
        <Type size={14} className="text-amber-400" />
        <span className="text-xs font-medium text-gray-200">{t('text')}</span>
      </div>
      <div className="p-3 space-y-4 text-xs">
        <Section icon={Type} label={t('sectionContent')}>
          <textarea value={text.text} onChange={(e) => update({ text: e.target.value })}
            className="w-full bg-surface border border-white/10 rounded px-2 py-1.5 text-gray-200 focus:border-accent/60 outline-none resize-none text-sm" rows={3} placeholder={t('textPlaceholder')} />
        </Section>

        <Section icon={Palette} label={t('sectionFont')}>
          <Row label={t('rowFontFamily')}>
            <select value={text.fontFamily} onChange={(e) => update({ fontFamily: e.target.value })}
              className="w-full bg-surface border border-white/10 rounded px-2 py-1 text-gray-200 focus:border-accent/60 outline-none">
              <option value="sans-serif">Sans Serif</option>
              <option value="serif">Serif</option>
              <option value="monospace">Monospace</option>
              <option value="'Arial', sans-serif">Arial</option>
              <option value="'Impact', sans-serif">Impact</option>
            </select>
          </Row>
          <Row label={`${t('rowFontSize')} ${text.fontSize}px`}>
            <input type="range" min={16} max={200} step={2} value={text.fontSize}
              onChange={(e) => update({ fontSize: Number(e.target.value) })} className="w-full" />
          </Row>
          <Row label={t('rowFontWeight')}>
            <select value={text.fontWeight} onChange={(e) => update({ fontWeight: Number(e.target.value) })}
              className="w-full bg-surface border border-white/10 rounded px-2 py-1 text-gray-200 focus:border-accent/60 outline-none">
              <option value={400}>{t('fontWeightNormal')}</option>
              <option value={600}>{t('fontWeightSemibold')}</option>
              <option value={700}>{t('fontWeightBold')}</option>
              <option value={900}>{t('fontWeightBlack')}</option>
            </select>
          </Row>
          <Row label={t('rowTextAlign')}>
            <div className="flex gap-1">
              {(['left', 'center', 'right'] as const).map((a) => (
                <button key={a} onClick={() => update({ textAlign: a })}
                  className={`flex-1 py-1 rounded text-[10px] transition-colors ${text.textAlign === a ? 'bg-accent text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>
                  {a === 'left' ? '←' : a === 'center' ? '↔' : '→'}
                </button>
              ))}
            </div>
          </Row>
        </Section>

        <Section icon={Palette} label={t('sectionColors')}>
          <Row label={t('rowTextColor')}>
            <div className="flex items-center gap-2">
              <input type="color" value={text.color} onChange={(e) => update({ color: e.target.value })} className="w-8 h-6 rounded border border-white/10 cursor-pointer" />
              <span className="text-gray-400">{text.color}</span>
            </div>
          </Row>
          <Row label={t('rowBackground')}>
            <div className="flex items-center gap-2">
              <input type="color" value={text.backgroundColor || '#000000'} onChange={(e) => update({ backgroundColor: e.target.value })} className="w-8 h-6 rounded border border-white/10 cursor-pointer" />
              <button onClick={() => update({ backgroundColor: '' })} className="text-[10px] text-gray-400 hover:text-white">
                {text.backgroundColor ? t('removeBg') : t('noBg')}
              </button>
            </div>
          </Row>
          <Row label={t('rowStroke')}>
            <div className="flex items-center gap-2">
              <input type="color" value={text.strokeColor} onChange={(e) => update({ strokeColor: e.target.value })} className="w-8 h-6 rounded border border-white/10 cursor-pointer" />
              <input type="number" value={text.strokeWidth} min={0} max={10} step={0.5}
                onChange={(e) => update({ strokeWidth: Number(e.target.value) })}
                className="w-16 bg-surface border border-white/10 rounded px-1.5 py-0.5 text-gray-200 outline-none" />
            </div>
          </Row>
        </Section>

        <Section icon={Move} label={t('sectionPosition')}>
          <Row label={`X: ${(text.x * 100).toFixed(0)}%`}>
            <input type="range" min={0} max={1} step={0.01} value={text.x}
              onChange={(e) => update({ x: Number(e.target.value) })} className="w-full" />
          </Row>
          <Row label={`Y: ${(text.y * 100).toFixed(0)}%`}>
            <input type="range" min={0} max={1} step={0.01} value={text.y}
              onChange={(e) => update({ y: Number(e.target.value) })} className="w-full" />
          </Row>
          <div className="grid grid-cols-3 gap-1 mt-1">
            {[
              { label: '↖', x: 0.2, y: 0.15 }, { label: '↑', x: 0.5, y: 0.15 }, { label: '↗', x: 0.8, y: 0.15 },
              { label: '←', x: 0.2, y: 0.5 }, { label: '•', x: 0.5, y: 0.5 }, { label: '→', x: 0.8, y: 0.5 },
              { label: '↙', x: 0.2, y: 0.85 }, { label: '↓', x: 0.5, y: 0.85 }, { label: '↘', x: 0.8, y: 0.85 },
            ].map((pos) => (
              <button key={pos.label} onClick={() => update({ x: pos.x, y: pos.y })}
                className="py-1 rounded bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white text-[11px] transition-colors">
                {pos.label}
              </button>
            ))}
          </div>
        </Section>

        <Section icon={Clock} label={t('sectionTime')}>
          <Row label={t('rowTextStart')}>
            <NumberInput value={text.startOnTimeline} step={0.1} min={0} onChange={(v) => update({ startOnTimeline: v })} format={fmtTime} />
          </Row>
          <Row label={t('rowDuration')}>
            <NumberInput value={text.duration} step={0.1} min={0.1} onChange={(v) => update({ duration: v })} format={fmtTime} />
          </Row>
          <Row label={`${t('rowTextOpacity')} ${(text.opacity * 100).toFixed(0)}%`}>
            <input type="range" min={0} max={1} step={0.05} value={text.opacity}
              onChange={(e) => update({ opacity: Number(e.target.value) })} className="w-full" />
          </Row>
          <Row label={`${t('rowFadeIn')} ${text.fadeIn.toFixed(1)}${t('secSuffix')}`}>
            <input type="range" min={0} max={3} step={0.1} value={text.fadeIn}
              onChange={(e) => update({ fadeIn: Number(e.target.value) })} className="w-full" />
          </Row>
          <Row label={`${t('rowFadeOut')} ${text.fadeOut.toFixed(1)}${t('secSuffix')}`}>
            <input type="range" min={0} max={3} step={0.1} value={text.fadeOut}
              onChange={(e) => update({ fadeOut: Number(e.target.value) })} className="w-full" />
          </Row>
        </Section>
      </div>
    </aside>
  );
}

/* ── Helpers ──────────────────────────────────────────────── */
function Section({ icon: Icon, label, children }: { icon: React.ElementType; label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2 text-gray-400 font-semibold uppercase tracking-wider text-[10px]">
        <Icon size={12} /> {label}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-gray-500 mb-0.5">{label}</label>{children}</div>;
}

function NumberInput({ value, step, min, max, onChange, format }: {
  value: number; step: number; min?: number; max?: number; onChange: (v: number) => void; format?: (v: number) => string;
}) {
  return (
    <div className="flex items-center gap-1">
      <input type="number" value={Number(value.toFixed(3))} step={step} min={min} max={max}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full bg-surface border border-white/10 rounded px-2 py-1 text-gray-200 focus:border-accent/60 outline-none" />
      {format && <span className="text-gray-500 whitespace-nowrap">{format(value)}</span>}
    </div>
  );
}
