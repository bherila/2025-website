import { render, screen } from '@testing-library/react'

import { PortalNavButton } from '../PortalNavButton'

describe('PortalNavButton', () => {
  it('has text-foreground class when inactive', () => {
    render(
      <PortalNavButton active={false} asChild>
        <a href='/test'>Home</a>
      </PortalNavButton>
    )
    const link = screen.getByRole('link', { name: 'Home' })
    expect(link.className).toContain('text-foreground')
  })

  it('does NOT have text-primary class when inactive (no gold color)', () => {
    render(
      <PortalNavButton active={false} asChild>
        <a href='/test'>Home</a>
      </PortalNavButton>
    )
    const link = screen.getByRole('link', { name: 'Home' })
    // text-primary would be the incorrect gold color from the global `a` rule
    expect(link.className).not.toContain('text-primary')
  })

  it('has bg-accent and text-accent-foreground when active', () => {
    render(
      <PortalNavButton active={true} asChild>
        <a href='/test'>Home</a>
      </PortalNavButton>
    )
    const link = screen.getByRole('link', { name: 'Home' })
    expect(link.className).toContain('bg-accent')
    expect(link.className).toContain('text-accent-foreground')
  })

  it('has hover:no-underline to override global a:hover underline', () => {
    render(
      <PortalNavButton active={false} asChild>
        <a href='/test'>Time Records</a>
      </PortalNavButton>
    )
    const link = screen.getByRole('link', { name: 'Time Records' })
    expect(link.className).toContain('hover:no-underline')
  })

  it('defaults to inactive when active prop is omitted', () => {
    render(
      <PortalNavButton asChild>
        <a href='/test'>Invoices</a>
      </PortalNavButton>
    )
    const link = screen.getByRole('link', { name: 'Invoices' })
    expect(link.className).toContain('text-foreground')
    // bg-accent should only appear as hover:bg-accent (from ghost variant), not as an active-state class
    const classes = link.className.split(/\s+/)
    expect(classes).not.toContain('bg-accent')
  })
})
