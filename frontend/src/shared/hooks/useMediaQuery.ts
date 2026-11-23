import { useCallback, useSyncExternalStore } from 'react'

/** Subscribe to a CSS media query. `fallback` is used where matchMedia does not exist (tests, SSR). */
export function useMediaQuery(query: string, fallback: boolean): boolean {
  const subscribe = useCallback(
    (notify: () => void) => {
      if (typeof window.matchMedia !== 'function') return () => {}
      const list = window.matchMedia(query)
      list.addEventListener('change', notify)
      return () => list.removeEventListener('change', notify)
    },
    [query],
  )
  const getSnapshot = () => (typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : fallback)
  return useSyncExternalStore(subscribe, getSnapshot, () => fallback)
}
