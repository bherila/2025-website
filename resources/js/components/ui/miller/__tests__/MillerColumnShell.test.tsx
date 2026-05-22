import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'

import { MillerColumnShell, type MillerColumnShellColumn } from '../MillerColumnShell'

const COLUMN: MillerColumnShellColumn = {
  key: 'col-1',
  id: 'form-1040',
  label: 'Form 1040',
  shortLabel: '1040',
  children: <div>Column content</div>,
}

function Harness({
  columns = [COLUMN],
  onTruncate = jest.fn(),
}: {
  columns?: MillerColumnShellColumn[]
  onTruncate?: jest.Mock
}): React.ReactElement {
  return (
    <MillerColumnShell
      homeView={<div>Home</div>}
      columns={columns}
      onTruncate={onTruncate}
    />
  )
}

describe('MillerColumnShell', () => {
  it('clicking the close button truncates the column at that depth', () => {
    const onTruncate = jest.fn()
    render(<Harness onTruncate={onTruncate} />)
    fireEvent.click(screen.getByRole('button', { name: /close columns after 1040/i }))
    expect(onTruncate).toHaveBeenCalledWith(0)
  })

  it('pressing Escape truncates the rightmost column', () => {
    const onTruncate = jest.fn()
    render(<Harness onTruncate={onTruncate} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onTruncate).toHaveBeenCalledWith(0)
  })

  it('Escape is ignored when focus is on an editable field', () => {
    const onTruncate = jest.fn()
    render(
      <MillerColumnShell
        homeView={<div>Home</div>}
        columns={[{ ...COLUMN, children: <input data-testid="text-input" /> }]}
        onTruncate={onTruncate}
      />,
    )
    const input = screen.getByTestId('text-input')
    input.focus()
    const escEvent = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    Object.defineProperty(escEvent, 'target', { value: input, writable: false })
    window.dispatchEvent(escEvent)
    expect(onTruncate).not.toHaveBeenCalled()
  })

  it('Escape does not truncate when a dialog with data-open is present', () => {
    const onTruncate = jest.fn()
    render(<Harness onTruncate={onTruncate} />)
    // Add a dialog element that the shell checks for
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    dialog.setAttribute('data-open', 'true')
    document.body.appendChild(dialog)
    try {
      fireEvent.keyDown(window, { key: 'Escape' })
      expect(onTruncate).not.toHaveBeenCalled()
    } finally {
      document.body.removeChild(dialog)
    }
  })
})
