import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  Film, Scissors, Zap, Shield, Download, Smartphone,
  MonitorPlay, Clock, Volume2, Layers, ChevronRight,
  WifiOff, Sparkles, ArrowRight,
} from 'lucide-react';
import { t, useLang } from '../lib/i18n';
import LanguageSwitcher from '../components/LanguageSwitcher';

export default function LandingPage() {
  const navigate = useNavigate();
  const [lang] = useLang();

  const features = [
    { icon: Scissors, title: t('featureTrimTitle'), desc: t('featureTrimDesc'), color: 'from-purple-500 to-violet-500' },
    { icon: Layers, title: t('featureMergeTitle'), desc: t('featureMergeDesc'), color: 'from-pink-500 to-rose-500' },
    { icon: Zap, title: t('featureTransTitle'), desc: t('featureTransDesc'), color: 'from-amber-500 to-orange-500' },
    { icon: Clock, title: t('featureSpeedTitle'), desc: t('featureSpeedDesc'), color: 'from-emerald-500 to-teal-500' },
    { icon: Volume2, title: t('featureVolumeTitle'), desc: t('featureVolumeDesc'), color: 'from-blue-500 to-cyan-500' },
    { icon: MonitorPlay, title: t('featurePreviewTitle'), desc: t('featurePreviewDesc'), color: 'from-indigo-500 to-purple-500' },
    { icon: Download, title: t('featureExportTitle'), desc: t('featureExportDesc'), color: 'from-green-500 to-emerald-500' },
    { icon: Shield, title: t('featurePrivacyTitle'), desc: t('featurePrivacyDesc'), color: 'from-red-500 to-pink-500' },
    { icon: WifiOff, title: t('featureOfflineTitle'), desc: t('featureOfflineDesc'), color: 'from-cyan-500 to-blue-500' },
  ];

  const howSteps = [
    { step: '1', title: t('howStep1Title'), desc: t('howStep1Desc') },
    { step: '2', title: t('howStep2Title'), desc: t('howStep2Desc') },
    { step: '3', title: t('howStep3Title'), desc: t('howStep3Desc') },
  ];

  const faqs = [
    { q: t('faqQ1'), a: t('faqA1') },
    { q: t('faqQ2'), a: t('faqA2') },
    { q: t('faqQ3'), a: t('faqA3') },
    { q: t('faqQ4'), a: t('faqA4') },
    { q: t('faqQ5'), a: t('faqA5') },
    { q: t('faqQ6'), a: t('faqA6') },
    { q: t('faqQ7'), a: t('faqA7') },
    { q: t('faqQ8'), a: t('faqA8') },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950 text-white">

      {/* ── SEO Helmet ──────────────────────────────────────────── */}
      <Helmet>
        <html lang={lang} />
        <title>{t('metaTitle')}</title>
        <meta name="description" content={t('metaDescription')} />
        <meta name="keywords" content={t('metaKeywords')} />
        <link rel="canonical" href="https://videoeditor.6io.io/" />
        <link rel="alternate" hrefLang="ru" href="https://videoeditor.6io.io/" />
        <link rel="alternate" hrefLang="en" href="https://videoeditor.6io.io/" />
        <link rel="alternate" hrefLang="x-default" href="https://videoeditor.6io.io/" />
        <meta property="og:title" content={t('ogTitle')} />
        <meta property="og:description" content={t('ogDescription')} />
        <meta property="og:url" content="https://videoeditor.6io.io/" />
        <meta property="og:locale" content={lang === 'ru' ? 'ru_RU' : 'en_US'} />
        <meta name="twitter:title" content={t('ogTitle')} />
        <meta name="twitter:description" content={t('ogDescription')} />
      </Helmet>

      {/* ── Header ──────────────────────────────────────────────── */}
      <header className="border-b border-white/5 backdrop-blur-sm bg-black/20 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => window.location.href='https://6io.io'}>
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center">
              <Film size={18} />
            </div>
            <span className="font-bold text-lg">{t('landingBrand')}</span>
          </div>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <button onClick={() => navigate('/editor')}
              className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 rounded-xl text-xs sm:text-sm font-semibold transition-all hover:scale-105">
              {t('openEditor')} <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </header>

      {/* ── Hero Section ────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-4 pt-16 pb-20 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-purple-500/10 border border-purple-500/20 rounded-full text-purple-300 text-sm mb-6">
          <Sparkles size={14} />
          {t('heroBadge')}
        </div>

        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-tight mb-6">
          {t('heroTitle1')}{' '}
          <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
            {t('heroTitle2')}
          </span>
        </h1>

        <p className="text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed">
          {t('heroDesc')}
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <button onClick={() => navigate('/editor')}
            className="flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 rounded-2xl text-lg font-bold transition-all hover:scale-105 shadow-lg shadow-purple-600/30">
            <Film size={22} />
            {t('heroCTA')}
            <ArrowRight size={20} />
          </button>
        </div>

        <p className="mt-5 text-sm text-gray-500">{t('heroBrowsers')}</p>
      </section>

      {/* ── Features Grid ───────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 pb-20" id="features">
        <h2 className="text-3xl font-bold text-center mb-4">{t('featuresTitle')}</h2>
        <p className="text-center text-gray-400 mb-12 max-w-xl mx-auto">{t('featuresSubtitle')}</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map(({ icon: Icon, title, desc, color }, i) => (
            <div key={i}
              className="group p-5 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:border-white/[0.12] hover:bg-white/[0.05] transition-all duration-300">
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center mb-3 group-hover:scale-110 transition-transform`}>
                <Icon size={20} />
              </div>
              <h3 className="font-bold text-white mb-1.5">{title}</h3>
              <p className="text-sm text-gray-400 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How It Works ────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-4 pb-20" id="how-it-works">
        <h2 className="text-3xl font-bold text-center mb-4">{t('howTitle')}</h2>
        <p className="text-center text-gray-400 mb-12 max-w-xl mx-auto">{t('howSubtitle')}</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {howSteps.map(({ step, title, desc }, i) => (
            <div key={i} className="text-center">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center text-2xl font-bold mx-auto mb-4 shadow-lg shadow-purple-600/20">
                {step}
              </div>
              <h3 className="text-xl font-bold mb-2">{title}</h3>
              <p className="text-gray-400 text-sm leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Supported Formats ───────────────────────────────────── */}
      <section className="max-w-4xl mx-auto px-4 pb-20">
        <h2 className="text-3xl font-bold text-center mb-4">{t('formatsTitle')}</h2>
        <p className="text-center text-gray-400 mb-8">{t('formatsSubtitle')}</p>
        <div className="flex flex-wrap justify-center gap-3">
          {['MP4', 'WebM', 'MOV', 'AVI', 'MKV', 'FLV', 'WMV', 'OGV', 'M4V', '3GP'].map(fmt => (
            <span key={fmt}
              className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm font-medium text-gray-300">
              {fmt}
            </span>
          ))}
        </div>
        <p className="text-center text-gray-500 text-sm mt-4">{t('formatsNote')}</p>
      </section>

      {/* ── Mobile CTA ──────────────────────────────────────────── */}
      <section className="max-w-4xl mx-auto px-4 pb-20">
        <div className="bg-gradient-to-r from-purple-600/20 to-pink-600/20 border border-purple-500/20 rounded-3xl p-8 sm:p-12 text-center">
          <div className="flex justify-center gap-3 mb-4">
            <Smartphone size={24} className="text-purple-400" />
            <MonitorPlay size={24} className="text-pink-400" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold mb-3">{t('ctaTitle')}</h2>
          <p className="text-gray-400 max-w-lg mx-auto mb-6">{t('ctaDesc')}</p>
          <button onClick={() => navigate('/editor')}
            className="inline-flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 rounded-xl text-base font-bold transition-all hover:scale-105 shadow-lg shadow-purple-600/30">
            {t('ctaBtn')} <ArrowRight size={18} />
          </button>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────── */}
      <section className="max-w-3xl mx-auto px-4 pb-20" id="faq">
        <h2 className="text-3xl font-bold text-center mb-10">{t('faqTitle')}</h2>
        <div className="space-y-4">
          {faqs.map(({ q, a }, i) => (
            <details key={i} className="group bg-white/[0.03] border border-white/[0.06] rounded-xl overflow-hidden">
              <summary className="flex items-center justify-between px-5 py-4 cursor-pointer text-white font-medium hover:bg-white/[0.02] transition-colors">
                {q}
                <ChevronRight size={18} className="text-gray-500 group-open:rotate-90 transition-transform flex-shrink-0 ml-4" />
              </summary>
              <div className="px-5 pb-4 text-gray-400 text-sm leading-relaxed">{a}</div>
            </details>
          ))}
        </div>
      </section>

      {/* ── SEO Text Block ──────────────────────────────────────── */}
      <section className="max-w-4xl mx-auto px-4 pb-16">
        <div className="bg-white/[0.02] border border-white/[0.04] rounded-2xl p-6 sm:p-8">
          <h2 className="text-xl font-bold mb-4">{t('seoH2')}</h2>
          <div className="text-sm text-gray-400 leading-relaxed space-y-3">
            <p dangerouslySetInnerHTML={{ __html: t('seoP1').replace(/<b>/g, '<strong class="text-gray-300">').replace(/<\/b>/g, '</strong>') }} />
            <p dangerouslySetInnerHTML={{ __html: t('seoP2').replace(/<b>/g, '<strong class="text-gray-300">').replace(/<\/b>/g, '</strong>') }} />
            <p dangerouslySetInnerHTML={{ __html: t('seoP3').replace(/<b>/g, '<strong class="text-gray-300">').replace(/<\/b>/g, '</strong>') }} />
            <p dangerouslySetInnerHTML={{ __html: t('seoP4').replace(/<b>/g, '<strong class="text-gray-300">').replace(/<\/b>/g, '</strong>') }} />
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────── */}
      <footer className="border-t border-white/5 bg-black/20">
        <div className="max-w-6xl mx-auto px-4 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center">
              <Film size={12} />
            </div>
            <span className="text-sm text-gray-400">{t('footerTagline')}</span>
          </div>
          <div className="text-sm text-gray-500">
            © {new Date().getFullYear()} • {t('footerRights')}
          </div>
        </div>
      </footer>
    </div>
  );
}
