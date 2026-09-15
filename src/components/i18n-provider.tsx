import type React from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { type Lang, type TranslationKey, translate } from '~/lib/i18n/translations';

interface I18nContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

const STORAGE_KEY = 'ocr-lang';
// Storage key used before the parsify → ocr rename; read once so returning users
// keep their language. Safe to drop after 2026-10-01.
const LEGACY_STORAGE_KEY = 'parsify-lang';

function isLang(value: string | null): value is Lang {
  return value === 'en' || value === 'zh' || value === 'ja';
}

function detectLang(): Lang {
  if (typeof window === 'undefined') return 'en';
  const current = localStorage.getItem(STORAGE_KEY);
  const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
  const stored = isLang(current) ? current : isLang(legacy) ? legacy : null;
  if (stored) {
    if (!current) localStorage.setItem(STORAGE_KEY, stored);
    return stored;
  }
  const nav = navigator.language?.toLowerCase() ?? '';
  if (nav.startsWith('zh')) return 'zh';
  if (nav.startsWith('ja')) return 'ja';
  return 'en';
}

const HTML_LANG: Record<Lang, string> = { en: 'en', zh: 'zh-CN', ja: 'ja' };

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectLang);

  useEffect(() => {
    document.documentElement.lang = HTML_LANG[lang];
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const value = useMemo<I18nContextValue>(
    () => ({
      lang,
      setLang,
      t: (key, params) => translate(lang, key, params),
    }),
    [lang, setLang]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
