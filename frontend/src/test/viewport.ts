/**
 * Stub `window.matchMedia` so a test can pretend the viewport is desktop-wide (>= 1024 px) or not,
 * and change it mid-test. Only the width query follows `set`; other queries (such as
 * prefers-reduced-motion) never match.
 */
export function stubViewport(desktop: boolean) {
  let wide = desktop
  const listeners = new Set<() => void>()
  const original = Object.getOwnPropertyDescriptor(window, 'matchMedia')

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => {
      const widthQuery = query.includes('min-width')
      return {
        media: query,
        get matches() {
          return widthQuery ? wide : false
        },
        addEventListener: (_type: string, callback: () => void) => {
          if (widthQuery) listeners.add(callback)
        },
        removeEventListener: (_type: string, callback: () => void) => {
          listeners.delete(callback)
        },
      }
    },
  })

  return {
    /** Change the viewport and notify subscribers (wrap in `act` when React is mounted). */
    set(value: boolean) {
      wide = value
      listeners.forEach((callback) => callback())
    },
    listenerCount: () => listeners.size,
    restore() {
      if (original) Object.defineProperty(window, 'matchMedia', original)
      else delete (window as { matchMedia?: unknown }).matchMedia
    },
  }
}
