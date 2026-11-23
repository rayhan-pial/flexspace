import { describe, expect, it } from 'vitest'
import { isContinuousControl, isTextEntry } from './useHistoryControls'

const input = (type: string) => {
  const el = document.createElement('input')
  el.type = type
  return el
}

describe('which controls group their edits into one step', () => {
  it.each(['text', 'number', 'color', 'range', 'search', 'url', 'email'])('an %s input streams changes', (type) => {
    expect(isContinuousControl(input(type))).toBe(true)
  })
  it.each(['checkbox', 'radio', 'button', 'submit'])('a %s input changes once per action, so each action is its own step', (type) => {
    expect(isContinuousControl(input(type))).toBe(false)
  })
  it('textareas and selects stream changes; plain buttons do not', () => {
    expect(isContinuousControl(document.createElement('textarea'))).toBe(true)
    expect(isContinuousControl(document.createElement('select'))).toBe(true)
    expect(isContinuousControl(document.createElement('button'))).toBe(false)
    expect(isContinuousControl(null)).toBe(false)
  })
  it('the colour picker surface counts', () => {
    const el = document.createElement('div')
    el.className = 'react-colorful__interactive'
    expect(isContinuousControl(el)).toBe(true)
  })
  it('only real text entry keeps the browser own Ctrl+Z', () => {
    expect(isTextEntry(input('text'))).toBe(true)
    expect(isTextEntry(document.createElement('textarea'))).toBe(true)
    expect(isTextEntry(input('checkbox'))).toBe(false)
    expect(isTextEntry(document.createElement('button'))).toBe(false)
    expect(isTextEntry(window)).toBe(false)
  })
})
