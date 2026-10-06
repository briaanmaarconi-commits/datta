import { useEffect } from 'react';

export function usePrivateTheme() {
  useEffect(() => {
    document.documentElement.classList.add('dark');

    return () => {
      document.documentElement.classList.remove('dark');
    };
  }, []);
}
