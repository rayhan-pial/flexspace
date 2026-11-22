import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import NotesWidget from './NotesWidget'

const setup = (body: string, mode: 'edit' | 'preview' = 'edit', title = 'Meeting notes') => {
  const onChangeProps = vi.fn()
  render(<NotesWidget title={title} props={{ body }} mode={mode} onChangeProps={onChangeProps} />)
  return { onChangeProps, textarea: screen.getByRole('textbox') as HTMLTextAreaElement }
}

describe('NotesWidget', () => {
  it('shows the note in a labelled textarea', () => {
    const { textarea } = setup('Line one\nLine two')
    expect(textarea).toHaveValue('Line one\nLine two')
    expect(screen.getByLabelText('Meeting notes text')).toBe(textarea)
  })

  it('falls back to a generic accessible name when the widget has no title', () => {
    setup('x', 'edit', '')
    expect(screen.getByLabelText('Note text')).toBeInTheDocument()
  })

  it('reports typing through the callback with the full new body (never mutating props itself)', async () => {
    const { onChangeProps } = setup('hi')
    await userEvent.setup().type(screen.getByRole('textbox'), '!')
    expect(onChangeProps).toHaveBeenLastCalledWith({ body: 'hi!' })
  })

  it('caps input at the 10,000 character limit', () => {
    expect(setup('').textarea).toHaveAttribute('maxlength', '10000')
  })

  it('shows a placeholder when empty', () => {
    expect(setup('').textarea).toHaveAttribute('placeholder', 'Write a note…')
  })

  it('shows a live character count in Edit but not in Preview', () => {
    const { unmount } = render(<NotesWidget title="T" props={{ body: 'hello' }} mode="edit" onChangeProps={() => {}} />)
    expect(screen.getByText('5 / 10,000')).toBeInTheDocument()
    unmount()
    render(<NotesWidget title="T" props={{ body: 'hello' }} mode="preview" onChangeProps={() => {}} />)
    expect(screen.queryByText(/10,000/)).not.toBeInTheDocument()
  })

  it('stays editable in Preview (note edits there change the same draft)', async () => {
    const { onChangeProps } = setup('a', 'preview')
    await userEvent.setup().type(screen.getByRole('textbox'), 'b')
    expect(onChangeProps).toHaveBeenLastCalledWith({ body: 'ab' })
  })

  it('renders markup as literal text, never as HTML', () => {
    const body = '<img src=x onerror=alert(1)><script>alert(1)</script><b>bold</b>'
    const { textarea } = setup(body)
    expect(textarea).toHaveValue(body)
    expect(document.querySelector('script, img, b')).toBeNull()
  })
})
