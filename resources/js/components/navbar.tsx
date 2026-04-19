import { ChevronDown, Menu, X } from 'lucide-react';
import * as React from 'react';
import { useRef, useState } from 'react';

import type { NavItem } from '@/client-management/types/hydration-schemas';
import { useTheme } from '@/hooks/useTheme';

import { NavDesktopDropdown } from './nav/NavDesktopDropdown';
import { NavMobileDropdown } from './nav/NavMobileDropdown';
import { safeHref } from './nav/safeHref';
import { ThemeToggle } from './nav/ThemeToggle';

type NavbarProps = {
  authenticated: boolean;
  isAdmin?: boolean;
  navItems?: NavItem[];
  currentUser?: { id: number; name: string; email: string; user_role?: string | null; last_login_date?: string | null } | null;
};

export default function Navbar({ authenticated, navItems = [], currentUser }: NavbarProps) {
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const initials = currentUser && currentUser.name
    ? currentUser.name.trim().split(/\s+/).map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
    : '';

  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement | null>(null);

  const { theme, setTheme } = useTheme();

  const logoutFormRef = useRef<HTMLFormElement>(null);

  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(e.target as Node)) {
        setMobileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleLogout = (e: React.MouseEvent) => {
    e.preventDefault();
    logoutFormRef.current?.submit();
  };

  const csrfToken = (document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement)?.content;

  return (
    <nav className='mx-auto max-w-7xl px-4 py-3 flex items-center justify-between gap-4'>
      {/* Left: Branding + Main nav */}
      <div className='flex items-center gap-6'>
        <div className='flex items-center gap-2'>
          {/* Mobile menu button */}
          <button
            type='button'
            onClick={() => setMobileMenuOpen((v) => !v)}
            className='md:hidden p-2 hover:bg-accent rounded-md text-foreground'
            aria-label='Toggle menu'
            aria-expanded={mobileMenuOpen}
            aria-controls='mobile-menu'
          >
            {mobileMenuOpen ? <X className='w-5 h-5' /> : <Menu className='w-5 h-5' />}
          </button>
          <a href='/' className='select-none'>
            <h1 className='text-lg font-semibold tracking-tight text-primary'>Ben Herila</h1>
          </a>
        </div>
        <ul className='hidden md:flex items-center gap-4 text-sm print:hidden'>
          {navItems.map((item, i) => {
            if (item.type === 'link') {
              return (
                <li key={i}>
                  <a className='hover:underline underline-offset-4 text-navbar-foreground' href={safeHref(item.href)}>
                    {item.label}
                  </a>
                </li>
              );
            }
            return <NavDesktopDropdown key={i} item={item} />;
          })}
        </ul>
      </div>

      {/* Mobile menu - Full screen overlay on small screens */}
      {mobileMenuOpen && (
        <div
          id='mobile-menu'
          ref={mobileMenuRef}
          className='md:hidden fixed inset-0 top-[60px] z-40 bg-background overflow-y-auto'
          role='menu'
        >
          <div className='px-4 py-2 space-y-1'>
            {navItems.map((item, i) => {
              if (item.type === 'link') {
                return (
                  <a key={i} className='block px-3 py-2 rounded hover:bg-accent hover:text-accent-foreground text-base text-foreground' href={safeHref(item.href)}>
                    {item.label}
                  </a>
                );
              }
              return <NavMobileDropdown key={i} item={item} />;
            })}

            {/* Account section in mobile menu */}
            {authenticated && (
              <div className='pt-2 border-t border-border'>
                <a className='block px-3 py-2 rounded hover:bg-accent hover:text-accent-foreground text-base text-foreground' href='/dashboard'>
                  User Settings
                </a>
                <a
                  className='block px-3 py-2 rounded hover:bg-accent hover:text-accent-foreground text-base text-destructive'
                  href='/logout'
                  onClick={handleLogout}
                >
                  Sign out
                </a>
              </div>
            )}

            {!authenticated && (
              <div className='pt-2 border-t border-border'>
                <a className='block px-3 py-2 rounded hover:bg-accent hover:text-accent-foreground text-base text-foreground' href='/login'>
                  Sign in
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Right: Theme toggle + external link + auth */}
      <div className='flex items-center gap-3 print:hidden'>
        <ThemeToggle theme={theme} onThemeChange={setTheme} />

        <a
          href='https://ac.bherila.net'
          target='_blank'
          rel="nofollow noopener noreferrer"
          className='hidden sm:inline-block px-3 py-1.5 rounded border border-border hover:bg-accent text-sm text-navbar-foreground'
        >
          ActiveCollab
        </a>

        {authenticated ? (
          <div className='relative' ref={userMenuRef}>
            <button
              type='button'
              onClick={() => setUserMenuOpen((v) => !v)}
              className='inline-flex items-center gap-2 px-3 py-1.5 rounded border border-border hover:bg-accent text-sm text-navbar-foreground'
              aria-expanded={userMenuOpen}
              aria-haspopup='menu'
            >
              <div className='h-6 w-6 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-medium' aria-hidden='true'>
                {initials || 'U'}
              </div>
              <span className='hidden sm:inline'>{currentUser?.name ?? 'My Account'}</span>
              <ChevronDown className={`w-4 h-4 transition-transform text-muted-foreground ${userMenuOpen ? 'rotate-180' : ''}`} aria-hidden='true' />
            </button>

            {userMenuOpen && (
              <div
                role='menu'
                className='absolute right-0 z-50 mt-2 w-48 rounded-md border border-border bg-popover text-popover-foreground shadow-[0_10px_30px_rgba(0,0,0,0.08)] p-2'
              >
                <a
                  role='menuitem'
                  className='block px-3 py-2 rounded hover:bg-accent hover:text-accent-foreground text-sm text-popover-foreground'
                  href='/dashboard'
                >
                  User Settings
                </a>
                <div className='my-1 border-t border-border' />
                <a
                  role='menuitem'
                  className='block px-3 py-2 rounded hover:bg-accent hover:text-accent-foreground text-sm text-destructive'
                  href='/logout'
                  onClick={handleLogout}
                >
                  Sign out
                </a>
                <form
                  ref={logoutFormRef}
                  action='/logout'
                  method='POST'
                  className='hidden'
                >
                  <input type='hidden' name='_token' value={csrfToken} />
                </form>
              </div>
            )}
          </div>
        ) : (
          <a href='/login' className='px-3 py-1.5 rounded border border-border hover:bg-accent text-sm text-navbar-foreground'>Sign in</a>
        )}
      </div>
    </nav>
  );
}
