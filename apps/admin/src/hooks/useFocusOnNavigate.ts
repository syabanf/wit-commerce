// apps/admin/src/hooks/useFocusOnNavigate.ts
import { useEffect } from 'react';
import { useLocation } from 'react-router';

/**
 * Moves focus to the main container or the first heading after a route change.
 * Improves keyboard/assistive‑technology navigation.
 */
export function useFocusOnNavigate() {
  const { pathname } = useLocation();
  useEffect(() => {
    const timer = setTimeout(() => {
      const main = document.getElementById('main');
      const heading = main?.querySelector('h1, h2');
      (heading ?? main)?.focus();
    }, 0);
    return () => clearTimeout(timer);
  }, [pathname]);
}
