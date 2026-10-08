// apps/admin/src/layouts/AdminLayout.tsx
import { Banner, cn, useMediaQuery } from '@rc/ui';
import { useEffect, useLayoutEffect, useRef, useState, Suspense } from 'react';
import { NavLink, Outlet, useLocation, useNavigationType, useMatches } from 'react-router';
import { usePersistentState } from '../lib/storage';
import { useStore } from '../state/store';
import { Header } from './Header';
import { leafFor, sectionFor } from './nav';
import { PhoneNav } from './PhoneNav';
import { SideRail } from './SideRail';
import { useNavCounts } from './useNavCounts';
import Spinner from '@rc/ui/Spinner';
import { useFocusOnNavigate } from '../hooks/useFocusOnNavigate';

// Scroll position store used across history entries
const scrollTops = new Map<string, number>();

export function AdminLayout() {
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const [expandedPref, setExpandedPref] = usePersistentState('rc.admin.rail', true);
  const [moreOpen, setMoreOpen] = useState(false);
  const { key, pathname } = useLocation();
  const navigationType = useNavigationType();
  const mainRef = useRef<HTMLElement>(null);
  const entryKey = useRef(key);
  const expanded = expandedPref && isDesktop;
  const { storageError } = useStore();

  // ---- Scroll‑position handling (unchanged) ----
  useEffect(() => {
    const main = mainRef.current;
    if (!main) return;
    const save = () => scrollTops.set(entryKey.current, main.scrollTop);
    main.addEventListener('scroll', save, { passive: true });
    return () => main.removeEventListener('scroll', save);
  }, []);

  // ---- Restore scroll on POP / reset on PUSH ----
  useLayoutEffect(() => {
    entryKey.current = key;
  }, [key]);

  useLayoutEffect(() => {
    mainRef.current?.scrollTo({
      top: navigationType === 'POP' ? scrollTops.get(key) ?? 0 : 0,
    });
  }, [pathname, navigationType]);

  // ---- Focus management after navigation ----
  useFocusOnNavigate();

  // ---- Breadcrumb extraction (expects `breadcrumb` in route.handle) ----
  const matches = useMatches();
  const breadcrumb = matches
    .filter((m) => (m.handle as any)?.breadcrumb)
    .pop()?.handle?.breadcrumb;

  return (
    <div className="gap-4 p-3 lg:p-4 print:bg-white print:p-0 relative flex h-dvh overflow-clip bg-surface print:block print:h-auto print:overflow-visible">
      {/* Glow effect */}
      <div aria-hidden className="inset-0 pointer-events-none absolute overflow-hidden print:hidden">
        <div
          className="blur-xl absolute -top-[30%] -right-[8%] h-[120%] w-[70%] opacity-70"
          style={{ background: GLOW }}
        />
      </div>

      {/* Side rail */}
      <div className="md:block relative hidden shrink-0 print:hidden">
        <SideRail expanded={expanded} canExpand={isDesktop} onToggle={() => setExpandedPref(!expandedPref)} />
      </div>

      {/* Main content */}
      <div className="min-w-0 gap-4 relative flex flex-1 flex-col">
        <nav aria-label="Skip links">
          <a
            href="#main"
            className="px-4 py-2 text-sm font-semibold focus:left-4 focus:top-3 sr-only z-30 rounded-full bg-ink text-on-ink shadow-float focus:not-sr-only focus:absolute"
          >
            Skip to content
          </a>
        </nav>
        <Header onMenu={() => setMoreOpen(true)} />
        <main
          id="main"
          tabIndex={-1}
          ref={mainRef}
          className="min-h-0 pb-24 pr-0.5 md:pb-2 print:p-0 relative flex-1 overflow-y-auto print:overflow-visible"
        >
          {storageError && (
            <Banner tone="danger" title="Changes cannot be saved" className="mb-4">
              This browser is out of storage or blocks it. Your changes stay until you reload the page.
            </Banner>
          )}

          {/* Section tabs when rail is collapsed */}
          {!expanded && <SectionTabs />}

          {/* Breadcrumb (if defined) */}
          {breadcrumb && (
            <nav aria-label="breadcrumb" className="mb-2">
              {typeof breadcrumb === 'function' ? breadcrumb() : breadcrumb}
            </nav>
          )}

          {/* Lazy‑loaded pages – generic spinner fallback */}
          <Suspense fallback={<Spinner />}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      <PhoneNav moreOpen={moreOpen} onMoreChange={setMoreOpen} />
    </div>
  );
}

/** Pill tabs across the pages of the current section, on its list pages, while the rail is collapsed. */
function SectionTabs() {
  const { pathname } = useLocation();
  const counts = useNavCounts();
  const section = sectionFor(pathname);
  const leaf = leafFor(pathname);
  if (!section.items || !leaf || pathname !== leaf.to) return null;
  return (
    <nav aria-label={`${section.label} pages`} className="mb-4 no-scrollbar flex max-w-full overflow-x-auto">
      <div className="gap-1 p-1 inline-flex shrink-0 rounded-full bg-card shadow-card">
        {section.items.map((item) => {
          const count = item.badge ? counts[item.badge] : 0;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'h-9 gap-2 px-4 text-sm font-semibold inline-flex items-center rounded-full whitespace-nowrap transition-colors',
                  isActive ? 'bg-ink text-on-ink' : 'text-muted hover:text-foreground',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {item.label}
                  {count > 0 && (
                    <span
                      className={cn(
                        'px-1.5 font-bold rounded-full text-[0.6875rem]',
                        isActive ? 'bg-white/20' : 'bg-accent-soft text-accent',
                      )}
                    >
                      {count}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}

// Export the glow constant as before – keep unchanged
const GLOW = [
  'radial-gradient(38% 34% at 72% 22%, color-mix(in srgb, var(--color-accent) 9%, transparent), transparent 70%)',
  'radial-gradient(28% 30% at 92% 48%, color-mix(in srgb, var(--color-accent) 6%, transparent), transparent 70%)',
  'radial-gradient(34% 30% at 55% 8%, color-mix(in srgb, var(--color-accent-soft) 55%, transparent), transparent 72%)',
].join(', ');
