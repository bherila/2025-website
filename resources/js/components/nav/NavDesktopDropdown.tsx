import { ChevronDown } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import type { NavItemDropdown } from '@/client-management/types/hydration-schemas'

import { NavDropdownChildren } from './NavDropdownChildren'

interface NavDesktopDropdownProps {
  item: NavItemDropdown
}

export function NavDesktopDropdown({ item }: NavDesktopDropdownProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLLIElement | null>(null)
  const menuId = `menu-${item.label.toLowerCase().replace(/\s+/g, '-')}`

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <li ref={ref} className='relative'>
      <button
        type='button'
        className='inline-flex items-center gap-1 hover:underline underline-offset-4 text-navbar-foreground'
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup='menu'
        id={`${menuId}-button`}
      >
        {item.label} <ChevronDown className='w-4 h-4 text-muted-foreground' aria-hidden='true' />
      </button>
      {open && (
        <div
          role='menu'
          aria-labelledby={`${menuId}-button`}
          className='absolute z-50 mt-2 w-64 rounded-md border border-border bg-popover text-popover-foreground shadow-[0_10px_30px_rgba(0,0,0,0.08)] p-2'
        >
          <NavDropdownChildren items={item.items} />
        </div>
      )}
    </li>
  )
}
