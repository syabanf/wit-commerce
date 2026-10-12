import type { ComponentType } from 'react'

/** Loads a page module on first visit, so every feature ships as its own chunk. */
export const page =
  <K extends string, M extends Record<K, ComponentType>>(load: () => Promise<M>, name: K) =>
  async () => ({ Component: (await load())[name] })

/** A route's breadcrumb label, fixed or built from its URL params. */
export interface CrumbArgs {
  params: Record<string, string | undefined>
}
export type Crumb = string | ((match: CrumbArgs) => string)

/** What admin routes keep in `handle`; the layout reads the deepest breadcrumb. */
export interface RouteHandle {
  breadcrumb?: Crumb
}
