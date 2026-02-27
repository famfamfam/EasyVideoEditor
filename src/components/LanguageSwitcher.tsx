import { Globe } from 'lucide-react';
import { useLang } from '../lib/i18n';

export default function LanguageSwitcher() {
  const [lang, setLanguage] = useLang();

  return (
    <div className="flex items-center gap-0.5 bg-white/5 rounded-lg p-0.5">
      <button
        onClick={() => setLanguage('ru')}
        className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
          lang === 'ru'
            ? 'bg-accent text-white'
            : 'text-gray-400 hover:text-white'
        }`}
        title="Русский"
      >
        RU
      </button>
      <button
        onClick={() => setLanguage('en')}
        className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
          lang === 'en'
            ? 'bg-accent text-white'
            : 'text-gray-400 hover:text-white'
        }`}
        title="English"
      >
        EN
      </button>
    </div>
  );
}
