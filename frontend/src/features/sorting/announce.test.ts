import { describe, expect, it } from 'vitest'
import { containerLabelOf, droppedAt, itemLabelOf, movedByButton, movedTo } from './announce'

const grip = (label: string) => {
  const el = document.createElement('span')
  el.setAttribute('aria-label', label)
  return el
}

describe('itemLabelOf', () => {
  it('uses the grip name without the leading Reorder', () => {
    expect(itemLabelOf({ handle: grip('Reorder task Call Sam') })).toBe('task Call Sam')
  })
  it('finds the grip inside the item when dnd-kit reports no handle', () => {
    const element = document.createElement('li')
    element.append(grip('Reorder image Sunset'))
    expect(itemLabelOf({ element })).toBe('image Sunset')
  })
  it('falls back to a neutral word rather than an id', () => {
    expect(itemLabelOf({ handle: null, element: null })).toBe('item')
    expect(itemLabelOf(null)).toBe('item')
    expect(itemLabelOf({ handle: grip('Reorder ') })).toBe('item')
  })
})

describe('containerLabelOf', () => {
  it('reads the list name from the page, and has a neutral fallback', () => {
    const root = document.createElement('div')
    root.innerHTML = '<ul data-container-id="a:b" aria-label="Today widgets"></ul><ul data-container-id="c"></ul>'
    expect(containerLabelOf('a:b', root)).toBe('Today widgets')
    expect(containerLabelOf('c', root)).toBe('this list')
    expect(containerLabelOf('missing', root)).toBe('this list')
  })
})

describe('messages', () => {
  it('count positions from one', () => {
    expect(movedTo('task A', 0, 4, 'Tasks')).toBe('task A: position 1 of 4 in Tasks.')
    expect(droppedAt('task A', 3, 4, 'Tasks')).toBe('Dropped task A at position 4 of 4 in Tasks.')
    expect(movedByButton(1, 3)).toBe('Moved to position 2 of 3.')
  })
})
