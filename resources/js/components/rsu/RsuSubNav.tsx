import { List, Plus, Settings } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export default function RsuSubNav() {
  const pathname = window.location.pathname

  const navItems = [
    {
      name: 'View awards',
      href: '/finance/rsu',
      icon: List,
    },
    {
      name: 'Manage awards',
      href: '/finance/rsu/manage',
      icon: Settings,
    },
    {
      name: 'Add an award',
      href: '/finance/rsu/add-grant',
      icon: Plus,
    },
  ]

  return (
    <div className="flex flex-col md:flex-row items-center justify-between mb-2 mt-2 gap-4">
      <div id="rsu-branding" className="mb-4 md:mb-0">
        <h2 className="text-2xl font-bold tracking-tight">RSU App</h2>
        <p className="text-muted-foreground">Manage your Restricted Stock Units</p>
      </div>
      <nav id="rsu-nav" className="flex gap-2">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive =
            pathname === item.href ||
            (pathname.endsWith('/') && pathname.slice(0, -1) === item.href) ||
            (item.href.endsWith('/') && item.href.slice(0, -1) === pathname)
          return (
            <Button
              key={item.href}
              asChild
              variant={isActive ? 'default' : 'outline'}
              className={cn(!isActive && 'text-muted-foreground')}
            >
              <a href={item.href}>
                <Icon className="mr-2 h-4 w-4" />
                {item.name}
              </a>
            </Button>
          )
        })}
      </nav>
    </div>
  )
}
