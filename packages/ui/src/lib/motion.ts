import { gsap } from 'gsap'

// Motion for the WIT kit, after the Lintel demo: content enters once per page, numbers count,
// the tab pill stretches, primary buttons follow a fine pointer. Reduced motion turns all of it off.

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)')

export const prefersReducedMotion = () => reduced.matches

/** A duration or stagger in seconds, or 0 under reduced motion. */
const t = (seconds: number) => (reduced.matches ? 0 : seconds)

type Targets = Element | Element[]

/** Cards and panels: rise 34px from 98.5% scale and fade in, one after another. */
export function riseIn(targets: Targets, { y = 34, stagger = 0.07, delay = 0 } = {}) {
  return gsap.fromTo(
    targets,
    { opacity: 0, y, scale: 0.985 },
    {
      opacity: 1,
      y: 0,
      scale: 1,
      duration: t(0.9),
      ease: 'power3.out',
      stagger: t(stagger),
      delay: t(delay),
      clearProps: 'transform,opacity',
    },
  )
}

/** Table and list rows: slide 12px and fade in. */
export function slideIn(targets: Targets, { x = 0, y = 12, stagger = 0.045, delay = 0 } = {}) {
  return gsap.fromTo(
    targets,
    { opacity: 0, x, y },
    {
      opacity: 1,
      x: 0,
      y: 0,
      duration: t(0.55),
      ease: 'power3.out',
      stagger: t(stagger),
      delay: t(delay),
      clearProps: 'transform,opacity',
    },
  )
}

/** Headline words rise out of their mask (`[data-word]` spans inside `overflow-hidden` wrappers). */
export function revealWords(targets: Targets, { delay = 0 } = {}) {
  return gsap.fromTo(
    targets,
    { yPercent: 115, rotation: 6 },
    {
      yPercent: 0,
      rotation: 0,
      duration: t(0.85),
      ease: 'power4.out',
      stagger: t(0.022),
      delay: t(delay),
      clearProps: 'transform',
    },
  )
}

/** Badges and counters pop in from 60% scale with a small overshoot. */
export function popIn(targets: Targets, { from = 0.6, stagger = 0.05, delay = 0 } = {}) {
  return gsap.fromTo(
    targets,
    { scale: from, opacity: 0 },
    {
      scale: 1,
      opacity: 1,
      duration: t(0.6),
      ease: 'back.out(3)',
      stagger: t(stagger),
      delay: t(delay),
      clearProps: 'transform,opacity',
    },
  )
}

/** Rows animated per list; later rows appear at once so the stagger never drags. */
const MAX_ROWS = 12

/** Elements of one motion kind, leaving out those nested inside another element of the same kind. */
function outermost(root: Element, kind: string): Element[] {
  const selector = `[data-motion="${kind}"]`
  return [...root.querySelectorAll(selector)].filter((el) => {
    const outer = el.parentElement?.closest(selector)
    return !outer || !root.contains(outer)
  })
}

/** The page entrance: words, then cards, then rows, then badges, for everything marked `data-motion` inside root. */
export function enter(root: Element) {
  // Rows count per list (a tbody, a divide-y stack), so each list animates its first rows.
  const lists = new Map<Element | null, Element[]>()
  for (const row of root.querySelectorAll('[data-motion="row"]')) {
    lists.set(row.parentElement, [...(lists.get(row.parentElement) ?? []), row])
  }
  const rows = [...lists.values()].flatMap((list) => list.slice(0, MAX_ROWS))
  const words = root.querySelectorAll('[data-word]')
  const cards = outermost(root, 'rise')
  const badges = root.querySelectorAll('[data-motion="pop"]')
  if (words.length) revealWords([...words])
  if (cards.length) riseIn(cards, { delay: 0.05 })
  if (rows.length) slideIn(rows, { delay: 0.25 })
  if (badges.length) popIn([...badges], { delay: 0.4 })
}

const counters = new WeakMap<Element, { value: number }>()

/** Counts the element's text from where it stands (0 the first time) to `to`. */
export function countTo(
  el: Element,
  to: number,
  format: (value: number) => string,
  { duration = 0.9, delay = 0 } = {},
) {
  let state = counters.get(el)
  if (!state) counters.set(el, (state = { value: 0 }))
  const counter = state
  gsap.killTweensOf(counter)
  if (reduced.matches || counter.value === to) {
    counter.value = to
    el.textContent = format(to)
    return
  }
  el.textContent = format(counter.value)
  gsap.to(counter, {
    value: to,
    duration,
    delay,
    ease: 'power3.out',
    onUpdate: () => {
      el.textContent = format(counter.value)
    },
    onComplete: () => {
      el.textContent = format(to)
    },
  })
}

const pillEdges = new WeakMap<Element, { left: number; right: number }>()

/**
 * Moves the ink pill behind the active tab by animating a rounded `clip-path` over a layer as wide as the track.
 * The leading edge runs ahead and the trailing edge catches up, so the pill stretches on the way.
 */
export function stretchPill(
  pill: HTMLElement,
  track: HTMLElement,
  active: HTMLElement | null,
  animate = true,
) {
  if (!active) {
    gsap.set(pill, { opacity: 0 })
    return
  }
  const top = active.offsetTop
  const bottom = track.offsetHeight - (active.offsetTop + active.offsetHeight)
  const left = active.offsetLeft
  const right = track.scrollWidth - (active.offsetLeft + active.offsetWidth)
  const clip = (l: number, r: number) => `inset(${top}px ${r}px ${bottom}px ${l}px round 999px)`
  gsap.set(pill, { width: track.scrollWidth })
  const from = pillEdges.get(pill)
  pillEdges.set(pill, { left, right })
  if (!animate || reduced.matches || !from) {
    gsap.set(pill, { clipPath: clip(left, right), opacity: 1 })
    return
  }
  const edges = { ...from }
  const forward = left > from.left
  const draw = () => gsap.set(pill, { clipPath: clip(edges.left, edges.right) })
  gsap.killTweensOf(edges)
  gsap.to(edges, {
    left,
    duration: forward ? 0.55 : 0.36,
    ease: forward ? 'power3.inOut' : 'power3.out',
    onUpdate: draw,
  })
  gsap.to(edges, {
    right,
    duration: forward ? 0.36 : 0.55,
    ease: forward ? 'power3.out' : 'power3.inOut',
    onUpdate: draw,
  })
}

/** Pulls the element a quarter of the way toward a fine pointer and lets it settle back. Returns a cleanup. */
export function magnetic(el: HTMLElement): () => void {
  if (!finePointer.matches) return () => {}
  const toX = gsap.quickTo(el, 'x', { duration: 0.5, ease: 'power3.out' })
  const toY = gsap.quickTo(el, 'y', { duration: 0.5, ease: 'power3.out' })
  const move = (event: PointerEvent) => {
    if (reduced.matches) return
    const box = el.getBoundingClientRect()
    toX((event.clientX - box.left - box.width / 2) * 0.24)
    toY((event.clientY - box.top - box.height / 2) * 0.3)
  }
  const leave = () => {
    toX(0)
    toY(0)
  }
  el.addEventListener('pointermove', move)
  el.addEventListener('pointerleave', leave)
  return () => {
    el.removeEventListener('pointermove', move)
    el.removeEventListener('pointerleave', leave)
    gsap.set(el, { clearProps: 'transform' })
  }
}
