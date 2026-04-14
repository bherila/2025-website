import type { NavDropdownChild } from '@/types/client-management/hydration-schemas'

import { safeHref } from './safeHref'

interface NavDropdownChildrenProps {
  items: NavDropdownChild[]
  mobile?: boolean
}

export function NavDropdownChildren({ items, mobile = false }: NavDropdownChildrenProps) {
  const linkCls = mobile
    ? 'block px-3 py-2 rounded hover:bg-accent hover:text-accent-foreground text-sm text-popover-foreground'
    : 'block px-3 py-2 rounded hover:bg-accent hover:text-accent-foreground text-popover-foreground'
  const groupCls = mobile
    ? 'px-3 py-1 text-xs uppercase tracking-wide text-muted-foreground'
    : 'px-2 py-1 text-xs uppercase tracking-wide text-muted-foreground'

  return (
    <>
      {items.map((item, i) => {
        if (item.type === 'link') {
          return (
            <a key={i} role={mobile ? undefined : 'menuitem'} className={linkCls} href={safeHref(item.href)}>
              {item.label}
            </a>
          )
        }
        if (item.type === 'group') {
          return (
            <div key={i} className={groupCls} aria-hidden='true'>
              {item.label}
            </div>
          )
        }
        return <div key={i} className='my-1 border-t border-border' />
      })}
    </>
  )
}
