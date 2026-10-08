import { cn } from '@rc/ui';
import { useEffect, useState } from 'react';

/**
 * Simple, theme‑aware spinner.
 * Uses Tailwind utilities that already exist in the UI package.
 */
export default function Spinner() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setShow(true), 100);
    return () => clearTimeout(id);
  }, []);

  if (!show) return null;
  return (
    <div
      className={cn('flex items-center justify-center py-8', 'text-primary')}
      aria-label="Loading"
    >
      <svg
        className="h-8 w-8 animate-spin"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx={12} cy={12} r={10} className="opacity-25" />
        <path d="M4 12a8 8 0 018-8" className="opacity-75" />
      </svg>
    </div>
  );
}
