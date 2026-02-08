import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { translations, type I18nKey, type Language } from "./translations";

type I18nContextValue = {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: I18nKey, params?: Record<string, string | number>) => string;
};

const DEFAULT_LANGUAGE: Language = "vi";
const STORAGE_KEY = "app.language";

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

function formatTemplate(template: string, params?: Record<string, string | number>) {
  if (!params) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const value = params[key];
    return value === undefined ? `{{${key}}}` : String(value);
  });
}

function getStoredLanguage(): Language | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === "en" || raw === "vi") return raw;
  return null;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => getStoredLanguage() ?? DEFAULT_LANGUAGE);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = language;
    }
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, language);
    }
  }, [language]);

  const setLanguage = (lang: Language) => setLanguageState(lang);

  const value = useMemo<I18nContextValue>(() => {
    return {
      language,
      setLanguage,
      t: (key, params) => formatTemplate(translations[language][key], params),
    };
  }, [language]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used within LanguageProvider");
  }
  return ctx;
}
