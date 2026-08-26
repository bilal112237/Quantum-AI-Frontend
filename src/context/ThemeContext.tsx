import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  applyThemeToDocument,
  readStoredTheme,
  writeStoredTheme,
  type ThemeId,
  THEMES,
} from '../themes';

type ThemeContextValue = {
  theme: ThemeId;
  setTheme: (id: ThemeId) => void;
  themes: typeof THEMES;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(() => readStoredTheme());

  
  useEffect(() => {
    applyThemeToDocument(theme);
    writeStoredTheme(theme);
  }, [theme]);

  const setTheme = useCallback((id: ThemeId) => {
    setThemeState(id);
  }, []);

  const value = useMemo(
    () => ({ theme, setTheme, themes: THEMES }),
    [theme, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
