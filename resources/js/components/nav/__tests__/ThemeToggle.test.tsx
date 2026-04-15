import { fireEvent, render, screen } from '@testing-library/react'

import { ThemeToggle } from '../ThemeToggle'

describe('ThemeToggle', () => {
  it('highlights the system button when theme is system', () => {
    render(<ThemeToggle theme='system' onThemeChange={jest.fn()} />)
    const btn = screen.getByLabelText('Use system theme')
    expect(btn.className).toContain('bg-primary')
    expect(btn.className).toContain('text-primary-foreground')
  })

  it('highlights the dark button when theme is dark', () => {
    render(<ThemeToggle theme='dark' onThemeChange={jest.fn()} />)
    const btn = screen.getByLabelText('Use dark theme')
    expect(btn.className).toContain('bg-primary')
    expect(btn.className).toContain('text-primary-foreground')
  })

  it('highlights the light button when theme is light', () => {
    render(<ThemeToggle theme='light' onThemeChange={jest.fn()} />)
    const btn = screen.getByLabelText('Use light theme')
    expect(btn.className).toContain('bg-primary')
    expect(btn.className).toContain('text-primary-foreground')
  })

  it('inactive buttons have muted foreground class', () => {
    render(<ThemeToggle theme='dark' onThemeChange={jest.fn()} />)
    const systemBtn = screen.getByLabelText('Use system theme')
    const lightBtn = screen.getByLabelText('Use light theme')
    expect(systemBtn.className).toContain('text-muted-foreground')
    expect(lightBtn.className).toContain('text-muted-foreground')
  })

  it('calls onThemeChange with correct value when dark button is clicked', () => {
    const handler = jest.fn()
    render(<ThemeToggle theme='system' onThemeChange={handler} />)
    fireEvent.click(screen.getByLabelText('Use dark theme'))
    expect(handler).toHaveBeenCalledWith('dark')
  })

  it('calls onThemeChange with correct value when light button is clicked', () => {
    const handler = jest.fn()
    render(<ThemeToggle theme='system' onThemeChange={handler} />)
    fireEvent.click(screen.getByLabelText('Use light theme'))
    expect(handler).toHaveBeenCalledWith('light')
  })

  it('calls onThemeChange with correct value when system button is clicked', () => {
    const handler = jest.fn()
    render(<ThemeToggle theme='dark' onThemeChange={handler} />)
    fireEvent.click(screen.getByLabelText('Use system theme'))
    expect(handler).toHaveBeenCalledWith('system')
  })

  it('active button has aria-pressed=true', () => {
    render(<ThemeToggle theme='dark' onThemeChange={jest.fn()} />)
    expect(screen.getByLabelText('Use dark theme')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('Use system theme')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByLabelText('Use light theme')).toHaveAttribute('aria-pressed', 'false')
  })
})
