import { ChevronDown } from 'lucide-react'
import { useState } from 'react'

import type { NavItemDropdown } from '@/types/client-management/hydration-schemas'

import { NavDropdownChildren } from './NavDropdownChildren'

interface NavMobileDropdownProps {
  item: NavItemDropdown
}

export function NavMobileDropdown({ item }: NavMobileDropdownProps) {
  const [open, setOpen] = useState(false)
  const menuId = `mobile-menu-${item.label.toLowerCase().replace(/\s+/g, '-')}`

  return (
    <div>
      <button
        type='button'
        className='w-full flex items-center justify-between px-3 py-2 rounded hover:bg-accent hover:text-accent-foreground text-base text-foreground'
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={menuId}
      >
        <span>{item.label}</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden='true' />
      </button>
      {open && (
        <div id={menuId} className='pl-4 space-y-1'>
          <NavDropdownChildren items={item.items} mobile />
        </div>
      )}
    </div>
  )
}
