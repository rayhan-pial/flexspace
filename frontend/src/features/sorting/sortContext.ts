import { createContext, useContext } from 'react'
import type { Preview } from './resolveDrop'
import type { SortAdapter } from './types'

export interface SortContextValue {
  adapter: SortAdapter
  /** Containers as they would be if the drag in progress ended now; `null` when no drag is running. */
  preview: Preview | null
}

export const SortContext = createContext<SortContextValue | null>(null)

/** The sorting context if a provider is above, otherwise `null` (Preview, or a widget rendered on its own). */
export function useOptionalSortContext(): SortContextValue | null {
  return useContext(SortContext)
}

export function useSortContext(): SortContextValue {
  const context = useContext(SortContext)
  if (!context) throw new Error('Sortable components must be rendered inside <SortProvider>.')
  return context
}
