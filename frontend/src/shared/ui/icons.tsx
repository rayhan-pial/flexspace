import type { ReactNode } from 'react'

/** Decorative 20px outline icons (Lucide-style paths, drawn inline so no dependency is needed). Always hidden from assistive technology. */
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      {children}
    </svg>
  )
}

export const WorkspaceIcon = () => (
  <Icon>
    <rect width="7" height="9" x="3" y="3" rx="1" />
    <rect width="7" height="5" x="14" y="3" rx="1" />
    <rect width="7" height="9" x="14" y="12" rx="1" />
    <rect width="7" height="5" x="3" y="16" rx="1" />
  </Icon>
)

export const OutlineIcon = () => (
  <Icon>
    <path d="M3 12h.01M3 18h.01M3 6h.01M8 12h13M8 18h13M8 6h13" />
  </Icon>
)

export const ComponentsIcon = () => (
  <Icon>
    <rect width="7" height="7" x="3" y="3" rx="1" />
    <rect width="7" height="7" x="14" y="3" rx="1" />
    <rect width="7" height="7" x="14" y="14" rx="1" />
    <rect width="7" height="7" x="3" y="14" rx="1" />
  </Icon>
)

export const TemplatesIcon = () => (
  <Icon>
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <path d="M3 9h18M9 21V9" />
  </Icon>
)

export const AppearanceIcon = () => (
  <Icon>
    <circle cx="13.5" cy="6.5" r=".5" />
    <circle cx="17.5" cy="10.5" r=".5" />
    <circle cx="8.5" cy="7.5" r=".5" />
    <circle cx="6.5" cy="12.5" r=".5" />
    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
  </Icon>
)

export const LogOutIcon = () => (
  <Icon>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="m16 17 5-5-5-5M21 12H9" />
  </Icon>
)

/** The FlexSpace mark: an indigo tile with a two-block glyph. */
export const BrandMark = () => (
  <svg aria-hidden="true" focusable="false" viewBox="0 0 32 32" width="28" height="28" className="shrink-0">
    <rect width="32" height="32" rx="8" fill="var(--ui-primary)" />
    <rect x="7" y="7" width="8" height="18" rx="2" fill="#fff" />
    <rect x="17" y="7" width="8" height="8" rx="2" fill="#fff" fillOpacity=".7" />
    <rect x="17" y="17" width="8" height="8" rx="2" fill="#fff" fillOpacity=".7" />
  </svg>
)
