/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Moon, Sun, Languages } from 'lucide-react';
import { STRINGS, type Lang, type StringKey } from '../i18n/strings';

/* =========================================================================
   Display preferences — language (English / हिन्दी) and theme (light / dark).

   Both are remembered in localStorage and applied to <html> (`lang` attribute
   and the `.dark` class), so every screen — including ones that never import
   this module — follows along through CSS.
   ========================================================================= */

export type Theme = 'light' | 'dark';

const LANG_KEY = 'nexgen.lang';
const THEME_KEY = 'nexgen.theme';

interface PreferencesValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  /** Translate a key; `{name}` placeholders are filled from `vars`. */
  t: (key: StringKey, vars?: Record<string, string | number>) => string;
}

const PreferencesContext = createContext<PreferencesValue | null>(null);

function initialLang(): Lang {
  try {
    const stored = window.localStorage.getItem(LANG_KEY);
    if (stored === 'en' || stored === 'hi') return stored;
  } catch {
    /* storage unavailable */
  }
  return navigator.language?.toLowerCase().startsWith('hi') ? 'hi' : 'en';
}

function initialTheme(): Theme {
  try {
    const stored = window.localStorage.getItem(THEME_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    /* storage unavailable */
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  const [theme, setThemeState] = useState<Theme>(initialTheme);

  useEffect(() => {
    document.documentElement.lang = lang === 'hi' ? 'hi' : 'en';
    try {
      window.localStorage.setItem(LANG_KEY, lang);
    } catch {
      /* ignore */
    }
  }, [lang]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0b1220' : '#1f57e0');
    try {
      window.localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  const t = useCallback(
    (key: StringKey, vars?: Record<string, string | number>) => {
      let text: string = STRINGS[lang][key] ?? STRINGS.en[key] ?? key;
      if (vars) {
        for (const [name, value] of Object.entries(vars)) {
          text = text.split(`{${name}}`).join(String(value));
        }
      }
      return text;
    },
    [lang]
  );

  const value = useMemo<PreferencesValue>(
    () => ({ lang, setLang: setLangState, theme, setTheme: setThemeState, t }),
    [lang, theme, t]
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesValue {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences must be used inside <PreferencesProvider>');
  return ctx;
}

/** Shorthand for the translator alone. */
export function useT() {
  return usePreferences().t;
}

/**
 * The language + theme switches. `tone="dark"` for placement on a dark band
 * (the app's left rail); `compact` drops the text labels.
 */
export function PreferenceToggles({ tone = 'light', compact = false }: { tone?: 'light' | 'dark'; compact?: boolean }) {
  const { lang, setLang, theme, setTheme, t } = usePreferences();
  const isDarkTone = tone === 'dark';
  const shell = isDarkTone
    ? 'border-white/15 bg-white/5 text-white/80'
    : 'border-slate-200 bg-white text-slate-700';
  const active = isDarkTone ? 'bg-white text-slate-900' : 'bg-indigo-600 text-white';

  return (
    <div className="flex items-center gap-2">
      <div
        role="group"
        aria-label={t('common.language')}
        className={`inline-flex items-center rounded-xl border p-0.5 text-[12px] font-bold ${shell}`}
      >
        {!compact && <Languages className="mx-1.5 h-3.5 w-3.5 opacity-70" aria-hidden="true" />}
        {(['en', 'hi'] as Lang[]).map(code => (
          <button
            key={code}
            type="button"
            onClick={() => setLang(code)}
            aria-pressed={lang === code}
            className={`cursor-pointer rounded-lg px-2 py-1 transition-colors ${lang === code ? active : 'hover:opacity-100 opacity-75'}`}
          >
            {code === 'en' ? 'EN' : 'हिं'}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        aria-label={theme === 'dark' ? t('common.theme.light') : t('common.theme.dark')}
        title={theme === 'dark' ? t('common.theme.light') : t('common.theme.dark')}
        className={`inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-xl border transition-colors ${shell} ${
          isDarkTone ? 'hover:bg-white/10' : 'hover:bg-slate-50'
        }`}
      >
        {theme === 'dark' ? <Sun className="h-4 w-4 text-amber-300" /> : <Moon className="h-4 w-4" />}
      </button>
    </div>
  );
}
