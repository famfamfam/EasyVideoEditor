/**
 * i18n — simple runtime translations for RU / EN.
 * Usage: import { t, setLanguage, getLanguage, useLang } from '../lib/i18n';
 */
import { useSyncExternalStore } from 'react';

export type Language = 'ru' | 'en';

// ─── Translation map ───────────────────────────────────────────────────────────

const translations = {
  ru: {
    // ── App / Header ─────────────────────────────────────
    appName: '6io.io - Видеоредактор',
    import: 'Импорт',
    undo: 'Отменить (Ctrl+Z)',
    redo: 'Повторить (Ctrl+Y)',
    export: 'Экспорт',
    exporting: 'Экспорт...',
    preview: 'Просмотр',
    download: 'Скачать',
    previewTitle: 'Просмотр результата',
    exportError: 'Ошибка экспорта',
    exportPreparing: 'Подготовка...',
    exportDone: 'Готово!',
    statsFiles: 'файлов',
    statsVideo: 'видео',
    statsAudio: 'аудио',
    secSuffix: 'с',

    // ── Mobile Tabs ─────────────────────────────────────
    tabMedia: 'Медиа',
    tabPreview: 'Превью',
    tabProperties: 'Свойства',
    collapseTimeline: 'Свернуть таймлайн',
    expandTimeline: 'Развернуть таймлайн',
    tapToAdd: 'Нажмите + чтобы добавить на таймлайн',

    // ── Media Panel ──────────────────────────────────────
    mediaLibrary: 'Медиатека',
    importFiles: 'Импортировать файлы',
    videoAudioImages: 'Видео, аудио, изображения',
    filterAll: 'Все',
    filterVideo: 'Видео',
    filterAudio: 'Аудио',
    filterImage: 'Фото',
    removeMedia: 'Удалить',
    doubleClickHint: 'Двойной клик — добавить на таймлайн',

    // ── Timeline ─────────────────────────────────────────
    addText: 'Текст',
    split: 'Разрезать',
    delete: 'Удалить',
    muteTrack: 'Выключить звук',
    unmuteTrack: 'Включить звук',
    lockTrack: 'Заблокировать',
    unlockTrack: 'Разблокировать',
    hideTrack: 'Скрыть',
    showTrack: 'Показать',
    addTrack: 'Дорожка',
    trackVideo: 'Видео',
    trackAudio: 'Аудио',
    trackText: 'Текст',

    // ── Properties Panel ─────────────────────────────────
    selectClipHint: 'Выберите клип или текст\nдля редактирования',
    selectedClips: 'Выбрано клипов',
    clip: 'Клип',
    text: 'Текст',

    sectionTime: 'Время',
    sectionSpeed: 'Скорость',
    sectionAudio: 'Аудио',
    sectionEffects: 'Эффекты',
    sectionTransitions: 'Переходы',
    sectionExtractAudio: 'Извлечь аудио',
    sectionFont: 'Шрифт',
    sectionColors: 'Цвета',
    sectionPosition: 'Позиция',
    sectionContent: 'Содержание',

    rowStart: 'Начало на таймлайне',
    rowDuration: 'Длительность',
    rowSourceFrom: 'Источник от',
    rowSourceTo: 'Источник до',
    rowVolume: 'Громкость',
    rowFadeIn: 'Fade In',
    rowFadeOut: 'Fade Out',
    rowBrightness: 'Яркость',
    rowContrast: 'Контраст',
    rowSaturation: 'Насыщенность',
    rowGrayscale: 'Оттенки серого',
    rowSepia: 'Сепия',
    rowHue: 'Оттенок',
    rowOpacity: 'Прозрачность',
    rowResetEffects: 'Сбросить эффекты',
    rowTransitionType: 'Тип',
    rowFontFamily: 'Семейство',
    rowFontSize: 'Размер',
    rowFontWeight: 'Жирность',
    rowTextAlign: 'Выравнивание',
    rowTextColor: 'Цвет текста',
    rowBackground: 'Фон',
    rowStroke: 'Обводка',
    rowTextStart: 'Начало',
    rowTextOpacity: 'Прозрачность',
    removeBg: 'Убрать',
    noBg: 'Нет фона',
    fontWeightNormal: 'Обычный',
    fontWeightSemibold: 'Полужирный',
    fontWeightBold: 'Жирный',
    fontWeightBlack: 'Чёрный',
    textPlaceholder: 'Введите текст...',

    transitionNoneHint: 'Разместите два клипа рядом на одной дорожке для добавления перехода',
    addTransitionToPrev: '← Добавить переход к предыдущему',
    addTransitionToNext: '→ Добавить переход к следующему',
    transitionDuration: 'Длительность',

    extractAudioHint: 'Извлечь аудио на отдельную дорожку. Звук в видео будет отключён.',
    extractAudioBtn: 'Извлечь аудио на дорожку',

    // ── Preview Panel ────────────────────────────────────
    previewEmpty: 'Предпросмотр',
    previewEmptyHint: 'Добавьте медиа или текст для начала',
    previewSkipBack: 'В начало',
    previewStepBack: '−0.1 сек (Shift+←)',
    previewPlay: 'Играть (Space)',
    previewPause: 'Пауза (Space)',
    previewStepForward: '+0.1 сек (Shift+→)',
    previewSkipForward: 'В конец',
    previewCaptureFrame: 'Захватить кадр (PNG)',

    // ── Transitions ──────────────────────────────────────
    trCrossfade: 'Перекрёстное затухание',
    trFadeBlack: 'Затемнение (чёрный)',
    trFadeWhite: 'Затемнение (белый)',
    trDissolve: 'Растворение',
    trWipeLeft: 'Шторка ←',
    trWipeRight: 'Шторка →',
    trWipeUp: 'Шторка ↑',
    trWipeDown: 'Шторка ↓',
    trSlideLeft: 'Сдвиг ←',
    trSlideRight: 'Сдвиг →',

    // ── Landing ──────────────────────────────────────────
    landingBrand: '6io.io - Видео Редактор',
    openEditor: 'Открыть редактор',
    heroBadge: '100% бесплатно • Без регистрации • Без водяных знаков',
    heroTitle1: 'Бесплатный онлайн',
    heroTitle2: 'видео редактор',
    heroDesc: 'Простой и мощный видеоредактор прямо в браузере. Обрезайте, склеивайте видео, добавляйте переходы и эффекты — без установки программ и без отправки файлов на сервер.',
    heroCTA: 'Начать редактирование',
    heroBrowsers: 'Работает в Chrome, Firefox, Safari и Edge',
    featuresTitle: 'Возможности видео редактора',
    featuresSubtitle: 'Всё что нужно для быстрого монтажа видео — бесплатно и без ограничений',
    howTitle: 'Как это работает',
    howSubtitle: 'Три простых шага — и ваше видео готово',
    formatsTitle: 'Поддерживаемые форматы',
    formatsSubtitle: 'Работайте с любыми популярными видеоформатами',
    formatsNote: 'Результат экспортируется в MP4 (H.264 + AAC) — универсальный формат для всех устройств',
    ctaTitle: 'Работает на любом устройстве',
    ctaDesc: 'Компьютер, планшет или смартфон — редактор адаптируется под ваш экран. Технология WebAssembly обеспечивает быструю обработку прямо в браузере.',
    ctaBtn: 'Попробовать бесплатно',
    faqTitle: 'Часто задаваемые вопросы',
    footerTagline: 'ВидеоРедактор — бесплатный онлайн видео редактор',
    footerRights: 'Все вычисления на вашем устройстве',
    seoTitle: 'Бесплатный видеоредактор онлайн',

    // ── Landing features ─────────────────────────────────
    featureTrimTitle: 'Обрезка видео',
    featureTrimDesc: 'Точная обрезка видео с визуальным предпросмотром. Установите начало и конец клипа ползунками.',
    featureMergeTitle: 'Склейка видео',
    featureMergeDesc: 'Объединяйте до 10 клипов в один файл. Перетаскивайте для изменения порядка.',
    featureTransTitle: 'Переходы между клипами',
    featureTransDesc: 'Плавные переходы: crossfade и fade-through-black с настраиваемой длительностью.',
    featureSpeedTitle: 'Скорость воспроизведения',
    featureSpeedDesc: 'Замедление от 0.25× до ускорения 4×. Создавайте слоумоушн или таймлапс эффекты.',
    featureVolumeTitle: 'Регулировка громкости',
    featureVolumeDesc: 'Настраивайте громкость каждого клипа от 0% до 200%. Отключайте звук одним кликом.',
    featurePreviewTitle: 'Предпросмотр',
    featurePreviewDesc: 'Просматривайте результат перед экспортом. Предпросмотр каждого клипа и всей склейки.',
    featureExportTitle: 'Скачивание в MP4',
    featureExportDesc: 'Экспорт в формате MP4 (H.264) — совместим со всеми устройствами и плеерами.',
    featurePrivacyTitle: 'Конфиденциальность',
    featurePrivacyDesc: 'Видео не загружаются на сервер. Вся обработка происходит локально в вашем браузере.',
    featureOfflineTitle: 'Работает офлайн',
    featureOfflineDesc: 'После первой загрузки движка редактор работает без интернета. Идеально для работы в дороге.',

    // ── How it works steps ───────────────────────────────
    howStep1Title: 'Загрузите видео',
    howStep1Desc: 'Добавьте видеофайлы с компьютера или телефона. Поддерживаются MP4, WebM, MOV, AVI, MKV.',
    howStep2Title: 'Настройте',
    howStep2Desc: 'Обрежьте, измените порядок, добавьте переходы, отрегулируйте скорость и громкость каждого клипа.',
    howStep3Title: 'Скачайте результат',
    howStep3Desc: 'Нажмите «Собрать» и скачайте готовый файл в формате MP4. Без водяных знаков.',

    // ── FAQ questions ────────────────────────────────────
    faqQ1: 'Это действительно бесплатно?',
    faqA1: 'Да, видео редактор полностью бесплатный. Нет платных функций, нет водяных знаков, нет ограничений по количеству видео. Вы можете использовать его сколько угодно.',
    faqQ2: 'Нужно ли регистрироваться?',
    faqA2: 'Нет, регистрация не требуется. Просто откройте сайт и начните редактировать видео. Мы не собираем персональные данные.',
    faqQ3: 'Мои видео загружаются на сервер?',
    faqA3: 'Нет! Вся обработка происходит прямо в вашем браузере с помощью технологии WebAssembly (FFmpeg.wasm). Ваши файлы никуда не отправляются — это полностью конфиденциально и безопасно.',
    faqQ4: 'Какие форматы поддерживаются?',
    faqA4: 'На вход принимаются все популярные форматы: MP4, WebM, MOV, AVI, MKV, FLV и другие. Результат экспортируется в MP4 (H.264 + AAC) — универсальный формат, работающий на всех устройствах.',
    faqQ5: 'Можно ли редактировать на телефоне?',
    faqA5: 'Да, редактор адаптирован для мобильных устройств. Однако для обработки больших или длинных видео рекомендуется использовать компьютер — обработка в браузере требует достаточно оперативной памяти.',
    faqQ6: 'Есть ли ограничения на размер видео?',
    faqA6: 'Технически ограничение — это объём оперативной памяти вашего устройства. Для комфортной работы рекомендуем файлы до 500 МБ. Количество клипов — до 10 в одной склейке.',
    faqQ7: 'Какие эффекты и переходы доступны?',
    faqA7: 'Доступны: обрезка (trim), склейка, плавный переход (crossfade), переход через чёрный экран (fade-black), регулировка скорости (0.25×–4×), громкость (0–200%), появление и затухание (fade in/out).',
    faqQ8: 'Работает ли офлайн?',
    faqA8: 'После первой загрузки видео-движка (~30 МБ) редактор может работать без подключения к интернету. Все операции выполняются локально.',

    // ── SEO block ────────────────────────────────────────
    seoH2: 'Бесплатный видеоредактор онлайн',
    seoP1: 'Наш <b>бесплатный онлайн видео редактор</b> — это простой инструмент для быстрого монтажа видео прямо в браузере. Вам не нужно скачивать тяжёлые программы вроде Adobe Premiere или DaVinci Resolve для простых задач: обрезать видео, склеить несколько клипов, добавить переход или изменить скорость воспроизведения.',
    seoP2: 'В отличие от других онлайн видеоредакторов, наш сервис работает <b>полностью на стороне клиента</b> — ваши видеофайлы никогда не покидают ваше устройство. Мы используем технологию WebAssembly (FFmpeg.wasm) для обработки видео прямо в вашем браузере.',
    seoP3: 'Редактор поддерживает все популярные <b>форматы видео</b>: MP4, WebM, MOV, AVI, MKV. Результат экспортируется в универсальный формат MP4 (кодек H.264), который воспроизводится на любых устройствах.',
    seoP4: 'Идеально подходит для тех, кому нужно быстро <b>обрезать видео онлайн</b>, склеить несколько роликов в один, убрать звук или изменить скорость воспроизведения. Никаких водяных знаков, никакой регистрации.',

    // ── SEO meta tags ─────────────────────────────────────
    metaTitle: 'Бесплатный онлайн видео редактор — обрезка, склейка, эффекты без регистрации',
    metaDescription: 'Бесплатный онлайн видео редактор в браузере. Обрезка, склейка, переходы, эффекты — без регистрации, без водяных знаков. Работает офлайн.',
    metaKeywords: 'бесплатный видео редактор, онлайн видео редактор, обрезать видео онлайн, склеить видео, видео редактор без регистрации, видеоредактор бесплатно, видео редактор без водяных знаков',
    ogTitle: 'Бесплатный онлайн видео редактор — без регистрации и водяных знаков',
    ogDescription: 'Простой и мощный видео редактор прямо в браузере. Обрезка, склейка, переходы, регулировка скорости и громкости. Полностью бесплатно.',
  },

  en: {
    // ── App / Header ─────────────────────────────────────
    appName: '6io.io - Video Editor',
    import: 'Import',
    undo: 'Undo (Ctrl+Z)',
    redo: 'Redo (Ctrl+Y)',
    export: 'Export',
    exporting: 'Exporting...',
    preview: 'Preview',
    download: 'Download',
    previewTitle: 'Preview Result',
    exportError: 'Export error',
    exportPreparing: 'Preparing...',
    exportDone: 'Done!',
    statsFiles: 'files',
    statsVideo: 'video',
    statsAudio: 'audio',
    secSuffix: 's',

    // ── Mobile Tabs ─────────────────────────────────────
    tabMedia: 'Media',
    tabPreview: 'Preview',
    tabProperties: 'Properties',
    collapseTimeline: 'Collapse timeline',
    expandTimeline: 'Expand timeline',
    tapToAdd: 'Tap + to add to timeline',

    // ── Media Panel ──────────────────────────────────────
    mediaLibrary: 'Media Library',
    importFiles: 'Import files',
    videoAudioImages: 'Video, audio, images',
    filterAll: 'All',
    filterVideo: 'Video',
    filterAudio: 'Audio',
    filterImage: 'Image',
    removeMedia: 'Remove',
    doubleClickHint: 'Double-click to add to timeline',

    // ── Timeline ─────────────────────────────────────────
    addText: 'Text',
    split: 'Split',
    delete: 'Delete',
    muteTrack: 'Mute',
    unmuteTrack: 'Unmute',
    lockTrack: 'Lock',
    unlockTrack: 'Unlock',
    hideTrack: 'Hide',
    showTrack: 'Show',
    addTrack: 'Track',
    trackVideo: 'Video',
    trackAudio: 'Audio',
    trackText: 'Text',

    // ── Properties Panel ─────────────────────────────────
    selectClipHint: 'Select a clip or text\nto edit properties',
    selectedClips: 'Clips selected',
    clip: 'Clip',
    text: 'Text',

    sectionTime: 'Time',
    sectionSpeed: 'Speed',
    sectionAudio: 'Audio',
    sectionEffects: 'Effects',
    sectionTransitions: 'Transitions',
    sectionExtractAudio: 'Extract Audio',
    sectionFont: 'Font',
    sectionColors: 'Colors',
    sectionPosition: 'Position',
    sectionContent: 'Content',

    rowStart: 'Start on timeline',
    rowDuration: 'Duration',
    rowSourceFrom: 'Source from',
    rowSourceTo: 'Source to',
    rowVolume: 'Volume',
    rowFadeIn: 'Fade In',
    rowFadeOut: 'Fade Out',
    rowBrightness: 'Brightness',
    rowContrast: 'Contrast',
    rowSaturation: 'Saturation',
    rowGrayscale: 'Grayscale',
    rowSepia: 'Sepia',
    rowHue: 'Hue Rotate',
    rowOpacity: 'Opacity',
    rowResetEffects: 'Reset effects',
    rowTransitionType: 'Type',
    rowFontFamily: 'Family',
    rowFontSize: 'Size',
    rowFontWeight: 'Weight',
    rowTextAlign: 'Align',
    rowTextColor: 'Text color',
    rowBackground: 'Background',
    rowStroke: 'Stroke',
    rowTextStart: 'Start',
    rowTextOpacity: 'Opacity',
    removeBg: 'Remove',
    noBg: 'No background',
    fontWeightNormal: 'Normal',
    fontWeightSemibold: 'Semi-bold',
    fontWeightBold: 'Bold',
    fontWeightBlack: 'Black',
    textPlaceholder: 'Enter text...',

    transitionNoneHint: 'Place two clips next to each other on the same track to add a transition',
    addTransitionToPrev: '← Add transition to previous',
    addTransitionToNext: '→ Add transition to next',
    transitionDuration: 'Duration',

    extractAudioHint: 'Extract audio to a separate track. Video audio will be muted.',
    extractAudioBtn: 'Extract audio to track',

    // ── Preview Panel ────────────────────────────────────
    previewEmpty: 'Preview',
    previewEmptyHint: 'Add media or text to get started',
    previewSkipBack: 'Go to start',
    previewStepBack: '−0.1 sec (Shift+←)',
    previewPlay: 'Play (Space)',
    previewPause: 'Pause (Space)',
    previewStepForward: '+0.1 sec (Shift+→)',
    previewSkipForward: 'Go to end',
    previewCaptureFrame: 'Capture frame (PNG)',

    // ── Transitions ──────────────────────────────────────
    trCrossfade: 'Crossfade',
    trFadeBlack: 'Fade to black',
    trFadeWhite: 'Fade to white',
    trDissolve: 'Dissolve',
    trWipeLeft: 'Wipe ←',
    trWipeRight: 'Wipe →',
    trWipeUp: 'Wipe ↑',
    trWipeDown: 'Wipe ↓',
    trSlideLeft: 'Slide ←',
    trSlideRight: 'Slide →',

    // ── Landing ──────────────────────────────────────────
    landingBrand: '6io.io - Video Editor',
    openEditor: 'Open editor',
    heroBadge: '100% free • No registration • No watermarks',
    heroTitle1: 'Free online',
    heroTitle2: 'video editor',
    heroDesc: 'Simple and powerful video editor right in your browser. Trim, merge videos, add transitions and effects — no software to install, no files sent to any server.',
    heroCTA: 'Start editing',
    heroBrowsers: 'Works in Chrome, Firefox, Safari and Edge',
    featuresTitle: 'Features',
    featuresSubtitle: 'Everything you need for fast video editing — free and unlimited',
    howTitle: 'How it works',
    howSubtitle: 'Three simple steps and your video is ready',
    formatsTitle: 'Supported formats',
    formatsSubtitle: 'Work with any popular video format',
    formatsNote: 'Output exported as MP4 (H.264 + AAC) — compatible with all devices',
    ctaTitle: 'Works on any device',
    ctaDesc: 'Desktop, tablet or smartphone — the editor adapts to your screen. WebAssembly technology ensures fast processing right in the browser.',
    ctaBtn: 'Try for free',
    faqTitle: 'FAQ',
    footerTagline: 'VideoEditor — free online video editor',
    footerRights: 'All processing on your device',
    seoTitle: 'Free online video editor',

    // ── Landing features ─────────────────────────────────
    featureTrimTitle: 'Trim video',
    featureTrimDesc: 'Precise video trimming with visual preview. Set start and end points using sliders.',
    featureMergeTitle: 'Merge clips',
    featureMergeDesc: 'Combine up to 10 clips into one file. Drag to reorder.',
    featureTransTitle: 'Clip transitions',
    featureTransDesc: 'Smooth transitions: crossfade and fade-through-black with adjustable duration.',
    featureSpeedTitle: 'Playback speed',
    featureSpeedDesc: 'Slow down from 0.25× to speed up 4×. Create slow-motion or time-lapse effects.',
    featureVolumeTitle: 'Volume control',
    featureVolumeDesc: 'Adjust volume from 0% to 200% per clip. Mute with one click.',
    featurePreviewTitle: 'Preview',
    featurePreviewDesc: 'Preview the result before export. Preview each clip and the full merge.',
    featureExportTitle: 'Export to MP4',
    featureExportDesc: 'Export as MP4 (H.264) — compatible with all devices and players.',
    featurePrivacyTitle: 'Privacy',
    featurePrivacyDesc: 'Videos are not uploaded to any server. All processing happens locally in your browser.',
    featureOfflineTitle: 'Works offline',
    featureOfflineDesc: 'After the first engine load, the editor works without internet. Great for travel.',

    // ── How it works steps ───────────────────────────────
    howStep1Title: 'Upload video',
    howStep1Desc: 'Add video files from your computer or phone. MP4, WebM, MOV, AVI, MKV supported.',
    howStep2Title: 'Edit',
    howStep2Desc: 'Trim, reorder, add transitions, adjust speed and volume for each clip.',
    howStep3Title: 'Download result',
    howStep3Desc: 'Click "Export" and download the finished MP4 file. No watermarks.',

    // ── FAQ questions ────────────────────────────────────
    faqQ1: 'Is it really free?',
    faqA1: 'Yes, the video editor is completely free. No paid features, no watermarks, no limits on the number of videos. Use it as much as you want.',
    faqQ2: 'Do I need to register?',
    faqA2: 'No registration required. Just open the site and start editing. We do not collect personal data.',
    faqQ3: 'Are my videos uploaded to a server?',
    faqA3: 'No! All processing happens right in your browser using WebAssembly (FFmpeg.wasm). Your files are never sent anywhere — completely private and secure.',
    faqQ4: 'What formats are supported?',
    faqA4: 'All popular formats are accepted: MP4, WebM, MOV, AVI, MKV, FLV and more. Output is exported as MP4 (H.264 + AAC) — compatible with all devices.',
    faqQ5: 'Can I edit on a phone?',
    faqA5: 'Yes, the editor is adapted for mobile devices. However, for large or long videos a computer is recommended — browser processing requires enough RAM.',
    faqQ6: 'Are there file size limits?',
    faqA6: 'Technically the limit is your device RAM. We recommend files up to 500 MB for best experience. Up to 10 clips per project.',
    faqQ7: 'What effects and transitions are available?',
    faqA7: 'Available: trim, merge, crossfade, fade-to-black, speed (0.25×–4×), volume (0–200%), fade in/out.',
    faqQ8: 'Does it work offline?',
    faqA8: 'After the first engine download (~30 MB) the editor can work without internet. All operations run locally.',

    // ── SEO block ────────────────────────────────────────
    seoH2: 'Free online video editor',
    seoP1: 'Our <b>free online video editor</b> is a simple tool for quick video editing right in your browser. No need to download heavy software like Adobe Premiere or DaVinci Resolve for simple tasks: trim video, merge clips, add a transition or change playback speed.',
    seoP2: 'Unlike other online video editors, our service runs <b>entirely client-side</b> — your video files never leave your device. We use WebAssembly (FFmpeg.wasm) to process video right in your browser.',
    seoP3: 'The editor supports all popular <b>video formats</b>: MP4, WebM, MOV, AVI, MKV. Output is exported as universal MP4 (H.264 codec), which plays on any device.',
    seoP4: 'Perfect for anyone who needs to quickly <b>trim video online</b>, merge clips, remove audio or change playback speed. No watermarks, no registration.',

    // ── SEO meta tags ─────────────────────────────────────
    metaTitle: 'Free Online Video Editor — Trim, Merge, Add Effects | No Registration',
    metaDescription: 'Free browser-based video editor. Trim, merge, add transitions and effects — no registration, no watermarks. Works offline.',
    metaKeywords: 'free video editor, online video editor, trim video online, merge video online, video editor no watermark, browser video editor, free video editing tool',
    ogTitle: 'Free Online Video Editor — No Registration, No Watermarks',
    ogDescription: 'Simple and powerful video editor right in your browser. Trim, merge, transitions, speed and volume control. Completely free.',
  },
} as const;

export type TranslationKey = keyof typeof translations.ru;

// ─── State ────────────────────────────────────────────────────────────────────

function detectLanguage(): Language {
  try {
    const saved = localStorage.getItem('lang') as Language | null;
    if (saved === 'ru' || saved === 'en') return saved;
    if (navigator.language.toLowerCase().startsWith('ru')) return 'ru';
  } catch {}
  return 'en';
}

let _lang: Language = detectLanguage();
const _listeners = new Set<() => void>();

function notify() {
  _listeners.forEach((fn) => fn());
}

export function setLanguage(lang: Language) {
  _lang = lang;
  try { localStorage.setItem('lang', lang); } catch {}
  notify();
}

export function getLanguage(): Language {
  return _lang;
}

// ─── Translation function ─────────────────────────────────────────────────────

export function t(key: TranslationKey): string {
  return (translations[_lang] as Record<string, string>)[key]
    ?? (translations.en as Record<string, string>)[key]
    ?? key;
}

// ─── React hook (re-renders on language change) ───────────────────────────────

export function useLang(): [Language, (l: Language) => void] {
  const lang = useSyncExternalStore(
    (cb) => { _listeners.add(cb); return () => _listeners.delete(cb); },
    getLanguage,
  );
  return [lang, setLanguage];
}
