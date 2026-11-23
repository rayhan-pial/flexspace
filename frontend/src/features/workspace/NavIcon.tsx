import { createElement } from 'react'
import { resolveIcon } from './navIcons'

/** An allowlisted icon by its persisted name (an unknown name falls back to Home). */
export default function NavIcon({ name, className }: { name: string; className?: string }) {
  return createElement(resolveIcon(name), { 'aria-hidden': true, className })
}
