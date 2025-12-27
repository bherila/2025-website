import { cn } from '@/lib/utils'

export default function RsuSubNav() {
  const pathname = window.location.pathname

  const navItems = [
    {
      name: 'View awards',
      href: '/rsu',
    },
    {
      name: 'Add an award',
      href: '/rsu/add-grant',
    },
  ]

  return (
    <div className="flex flex-col md:flex-row items-center mb-2 mt-2 gap-4">
      <div id="rsu-branding" className="mb-4 md:mb-0 mr-16 pr-12 md:pr-24">
        <h2 className="text-2xl font-bold tracking-tight">RSU App</h2>
        <p className="text-muted-foreground">Manage your Restricted Stock Units</p>
      </div>
      <nav id="rsu-nav" className="flex gap-2">
        {navItems.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className={cn(
              'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 h-10 px-4 py-2',
              pathname === item.href ||
                (pathname.endsWith('/') && pathname.slice(0, -1) === item.href) ||
                (item.href.endsWith('/') && item.href.slice(0, -1) === pathname)
                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            {item.name}
          </a>
        ))}
      </nav>
    </div>
  )
}
