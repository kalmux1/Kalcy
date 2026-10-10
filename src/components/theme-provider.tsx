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
    root.classList.remove('dark', 'oled');

    let dark = false;
    if (theme === 'dark') {
      dark = true;
      root.classList.add('dark');
    } else if (theme === 'system') {
      dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (dark) root.classList.add('dark');
    }

    // Check for OLED dark mode (user setting could be extended)
    setIsDark(dark);
  }, [theme]);

  const setTheme = (newTheme: ThemeMode) => {
    updatePreferences({ theme: newTheme });
  };

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
