'use client';

import { useEffect } from 'react';
import { useStore } from '@/lib/store';
import { getStoredTheme, saveTheme } from '@/lib/utils';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { theme, setTheme } = useStore();

  useEffect(() => {
    // Load theme from localStorage on mount
    const storedTheme = getStoredTheme();
    if (storedTheme !== theme) {
      setTheme(storedTheme);
    }
    
    // Apply theme to document
    document.documentElement.classList.toggle('dark', storedTheme === 'dark');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Update document class when theme changes
    document.documentElement.classList.toggle('dark', theme === 'dark');
    saveTheme(theme);
  }, [theme]);

  return <>{children}</>;
}
