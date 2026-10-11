'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useStore } from '@/lib/store';
import type { ThemeMode } from '@/lib/types';

interface ThemeContextValue {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const preferences = useStore((s) => s.preferences);
  const updatePreferences = useStore((s) => s.updatePreferences);
  const [isDark, setIsDark] = useState(false);

  const theme = preferences.theme;

  useEffect(() => {
    const root = document.documentElement;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');

    const apply = () => {
      root.classList.remove('dark');
      let dark = false;
      if (theme === 'dark') dark = true;
      else if (theme === 'system') dark = mq.matches;
      if (dark) root.classList.add('dark');
      setIsDark(dark);
    };

    apply();

    if (theme === 'system') {
      mq.addEventListener('change', apply);
      return () => mq.removeEventListener('change', apply);
    }
  }, [theme]);

  const setTheme = (newTheme: ThemeMode) => updatePreferences({ theme: newTheme });

  return (
    <ThemeContext.Provider value={{ theme, setTheme, isDark }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}