import '@testing-library/jest-dom'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'

import NewAccountForm from '../NewAccountForm'

// ── mocks ─────────────────────────────────────────────────────────────────────

// Keep Checkbox as a real input so react-hook-form can track its value.
jest.mock('@/components/ui/checkbox', () => ({
  Checkbox: ({
    checked,
    onCheckedChange,
    id,
  }: {
    checked?: boolean
    onCheckedChange?: (checked: boolean) => void
    id?: string
  }) => (
    <input
      id={id}
      type="checkbox"
      checked={checked}
      onChange={(e) => onCheckedChange?.(e.target.checked)}
    />
  ),
}))

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, type, disabled, ...props }: React.ComponentProps<'button'>) => (
    <button type={type} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}))

jest.mock('@/components/ui/card', () => ({
  CardFooter: ({ children, className }: React.ComponentProps<'div'>) => (
    <div className={className}>{children}</div>
  ),
}))

jest.mock('@/components/ui/input', () => ({
  Input: ({ placeholder, autoComplete, ...props }: React.ComponentProps<'input'>) => (
    <input placeholder={placeholder} autoComplete={autoComplete} {...props} />
  ),
}))

jest.mock('@/components/ui/label', () => ({
  Label: ({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) => (
    <label htmlFor={htmlFor}>{children}</label>
  ),
}))

jest.mock('@/components/ui/alert', () => ({
  Alert: ({ children, variant }: { children: React.ReactNode; variant?: string }) => (
    <div role="alert" data-variant={variant}>
      {children}
    </div>
  ),
  AlertTitle: ({ children }: { children: React.ReactNode }) => <strong>{children}</strong>,
  AlertDescription: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}))

// ── helpers ───────────────────────────────────────────────────────────────────

function fillAccountName(name = 'Test Account') {
  const input = screen.getByPlaceholderText('Enter account name')
  fireEvent.change(input, { target: { value: name } })
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('NewAccountForm', () => {
  beforeEach(() => {
    jest.restoreAllMocks()
    const meta = document.createElement('meta')
    meta.name = 'csrf-token'
    meta.content = 'test-token'
    document.head.appendChild(meta)
  })

  afterEach(() => {
    document.head.querySelector('meta[name="csrf-token"]')?.remove()
    jest.clearAllMocks()
  })

  it('renders the account number field with the correct label', () => {
    render(<NewAccountForm onUpdate={jest.fn()} />)
    expect(screen.getByText('Account number (or last 4)')).toBeInTheDocument()
  })

  it('renders the helper copy for the account number field', () => {
    render(<NewAccountForm onUpdate={jest.fn()} />)
    expect(
      screen.getByText(/Account suffix helps match broker\/bank PDFs/),
    ).toBeInTheDocument()
  })

  it('renders the Create Account button', () => {
    render(<NewAccountForm onUpdate={jest.fn()} />)
    expect(screen.getByRole('button', { name: 'Create Account' })).toBeInTheDocument()
  })

  it('renders an optional account number input placeholder', () => {
    render(<NewAccountForm onUpdate={jest.fn()} />)
    expect(screen.getByPlaceholderText('e.g. 1234')).toBeInTheDocument()
  })

  it('submits acctNumber in the request body when provided', async () => {
    const mockFetch = jest.fn().mockResolvedValue({ ok: true })
    window.fetch = mockFetch

    render(<NewAccountForm onUpdate={jest.fn()} />)

    fillAccountName()
    fireEvent.change(screen.getByPlaceholderText('e.g. 1234'), { target: { value: '5678' } })

    fireEvent.submit(screen.getByRole('button', { name: 'Create Account' }).closest('form')!)

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/finance/accounts',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"acctNumber":"5678"'),
        }),
      )
    })
  })

  it('omits acctNumber key from request body when field is empty', async () => {
    const mockFetch = jest.fn().mockResolvedValue({ ok: true })
    window.fetch = mockFetch

    render(<NewAccountForm onUpdate={jest.fn()} />)

    fillAccountName()
    // Leave acctNumber empty

    fireEvent.submit(screen.getByRole('button', { name: 'Create Account' }).closest('form')!)

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled()
      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string)
      expect(body.acctNumber).toBeUndefined()
    })
  })

  it('calls onUpdate after successful submission', async () => {
    const mockFetch = jest.fn().mockResolvedValue({ ok: true })
    window.fetch = mockFetch
    const onUpdate = jest.fn()

    render(<NewAccountForm onUpdate={onUpdate} />)

    fillAccountName()
    fireEvent.submit(screen.getByRole('button', { name: 'Create Account' }).closest('form')!)

    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalled()
    })
  })
})
