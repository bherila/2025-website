import { ChevronDown, Laptop, Menu, Moon, Sun, X } from 'lucide-react';
import * as React from 'react';
import { useEffect, useRef, useState } from 'react';

import type { NavDropdownChild, NavItem, NavItemDropdown } from '@/types/client-management/hydration-schemas';

type NavbarProps = {
  authenticated: boolean;
  isAdmin?: boolean;
  navItems?: NavItem[];
  currentUser?: { id: number; name: string; email: string; user_role?: string | null; last_login_date?: string | null } | null;
};

type ThemeMode = 'system' | 'dark' | 'light';

function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = mode === 'dark' || (mode === 'system' && prefersDark);
  root.classList.toggle('dark', isDark);
}

/** Sanitize hrefs to prevent javascript: or data: URLs from being rendered. */
function safeHref(href: string): string {
  if (href.startsWith('/') || href.startsWith('https://') || href.startsWith('http://')) {
    return href;
  }
  return '#';
}

/** Renders the children of a dropdown (links, groups, dividers). */
function DropdownChildren({ items, mobile = false }: { items: NavDropdownChild[]; mobile?: boolean }) {
  const linkCls = mobile
    ? 'block px-3 py-2 rounded hover:bg-gray-50 dark:hover:bg-[#1f1f1e] text-sm text-gray-900 dark:text-[#E5E5E5]'
    : 'block px-3 py-2 rounded hover:bg-gray-50 dark:hover:bg-[#1f1f1e] text-gray-900 dark:text-[#E5E5E5]';
  const groupCls = mobile
    ? 'px-3 py-1 text-xs uppercase tracking-wide text-gray-500 dark:text-[#A1A09A]'
    : 'px-2 py-1 text-xs uppercase tracking-wide text-gray-500 dark:text-[#A1A09A]';

  return (
    <>
      {items.map((item, i) => {
        if (item.type === 'link') {
          return (
            <a key={i} role={mobile ? undefined : 'menuitem'} className={linkCls} href={safeHref(item.href)}>
              {item.label}
            </a>
          );
        }
        if (item.type === 'group') {
          return (
            <div key={i} className={groupCls} aria-hidden='true'>
              {item.label}
            </div>
          );
        }
        // divider
        return <div key={i} className='my-1 border-t border-gray-100 dark:border-[#3E3E3A]' />;
      })}
    </>
  );
}

/** Desktop dropdown menu item. */
function DesktopDropdown({ item }: { item: NavItemDropdown }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLLIElement | null>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const menuId = `menu-${item.label.toLowerCase().replace(/\s+/g, '-')}`;

  return (
    <li ref={ref} className='relative'>
      <button
        type='button'
        className='inline-flex items-center gap-1 hover:underline underline-offset-4 text-gray-900 dark:text-[#E5E5E5]'
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup='menu'
        id={`${menuId}-button`}
      >
        {item.label} <ChevronDown className='w-4 h-4 text-gray-500 dark:text-[#A1A09A]' aria-hidden='true' />
      </button>
      {open && (
        <div
          role='menu'
          aria-labelledby={`${menuId}-button`}
          className='absolute z-50 mt-2 w-64 rounded-md border border-gray-200 dark:border-[#3E3E3A] bg-white dark:bg-[#161615] shadow-[0_10px_30px_rgba(0,0,0,0.08)] p-2'
        >
          <DropdownChildren items={item.items} />
        </div>
      )}
    </li>
  );
}

/** Mobile expandable section. */
function MobileDropdown({ item }: { item: NavItemDropdown }) {
  const [open, setOpen] = useState(false);
  const menuId = `mobile-menu-${item.label.toLowerCase().replace(/\s+/g, '-')}`;

  return (
    <div>
      <button
        type='button'
        className='w-full flex items-center justify-between px-3 py-2 rounded hover:bg-gray-50 dark:hover:bg-[#1f1f1e] text-base'
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={menuId}
      >
        <span>{item.label}</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden='true' />
      </button>
      {open && (
        <div id={menuId} className='pl-4 space-y-1'>
          <DropdownChildren items={item.items} mobile />
        </div>
      )}
    </div>
  );
}

export default function Navbar({ authenticated, navItems = [], currentUser }: NavbarProps) {
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const initials = currentUser && currentUser.name
    ? currentUser.name.trim().split(/\s+/).map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
    : '';

  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement | null>(null);

  const [theme, setTheme] = useState<ThemeMode>(() => (localStorage.getItem('theme') as ThemeMode) || 'system');

  const logoutFormRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
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

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      const saved = (localStorage.getItem('theme') as ThemeMode) || 'system';
      if (saved === 'system') applyTheme('system');
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return (
    <nav className='mx-auto max-w-7xl px-4 py-3 flex items-center justify-between gap-4'>
      {/* Left: Branding + Main nav */}
      <div className='flex items-center gap-6'>
        <div className='flex items-center gap-2'>
          {/* Mobile menu button */}
          <button
            type='button'
            onClick={() => setMobileMenuOpen((v) => !v)}
            className='md:hidden p-2 hover:bg-gray-100 dark:hover:bg-[#1f1f1e] rounded-md'
            aria-label='Toggle menu'
            aria-expanded={mobileMenuOpen}
            aria-controls='mobile-menu'
          >
            {mobileMenuOpen ? <X className='w-5 h-5' /> : <Menu className='w-5 h-5' />}
          </button>
          <a href='/' className='select-none'>
            <h1 className='text-lg font-semibold tracking-tight'>Ben Herila</h1>
          </a>
        </div>
        <ul className='hidden md:flex items-center gap-4 text-sm print:hidden'>
          {navItems.map((item, i) => {
            if (item.type === 'link') {
              return (
                <li key={i}>
                  <a className='hover:underline underline-offset-4' href={safeHref(item.href)}>
                    {item.label}
                  </a>
                </li>
              );
            }
            return <DesktopDropdown key={i} item={item} />;
          })}
        </ul>
      </div>

      {/* Mobile menu - Full screen overlay on small screens */}
      {mobileMenuOpen && (
        <div
          id='mobile-menu'
          ref={mobileMenuRef}
          className='md:hidden fixed inset-0 top-[60px] z-40 bg-white dark:bg-[#161615] overflow-y-auto'
          role='menu'
        >
          <div className='px-4 py-2 space-y-1'>
            {navItems.map((item, i) => {
              if (item.type === 'link') {
                return (
                  <a key={i} className='block px-3 py-2 rounded hover:bg-gray-50 dark:hover:bg-[#1f1f1e] text-base' href={safeHref(item.href)}>
                    {item.label}
                  </a>
                );
              }
              return <MobileDropdown key={i} item={item} />;
            })}

            {/* Account section in mobile menu */}
            {authenticated && (
              <div className='pt-2 border-t border-gray-100 dark:border-[#3E3E3A]'>
                <a className='block px-3 py-2 rounded hover:bg-gray-50 dark:hover:bg-[#1f1f1e] text-base' href='/dashboard'>
                  User Settings
                </a>
                <a
                  className='block px-3 py-2 rounded hover:bg-gray-50 dark:hover:bg-[#1f1f1e] text-base text-red-600 dark:text-red-400'
                  href='/logout'
                  onClick={handleLogout}
                >
                  Sign out
                </a>
              </div>
            )}

            {!authenticated && (
              <div className='pt-2 border-t border-gray-100 dark:border-[#3E3E3A]'>
                <a className='block px-3 py-2 rounded hover:bg-gray-50 dark:hover:bg-[#1f1f1e] text-base' href='/login'>
                  Sign in
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Right: Theme toggle + external link + auth */}
      <div className='flex items-center gap-3 print:hidden'>
        {/* Tri-state theme toggle */}
        <div className='inline-flex items-center overflow-hidden rounded-md border border-gray-200 dark:border-[#3E3E3A]' role='group' aria-label='Color theme'>
          <button
            type='button'
            onClick={() => setTheme('system')}
            className={`px-2 py-1.5 transition-colors ${theme === 'system' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-gray-100 dark:hover:bg-[#1f1f1e]'}`}
            title='System'
            aria-pressed={theme === 'system'}
            aria-label='Use system theme'
          >
            <Laptop className='w-4 h-4' aria-hidden='true' />
          </button>
          <button
            type='button'
            onClick={() => setTheme('dark')}
            className={`px-2 py-1.5 transition-colors ${theme === 'dark' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-gray-100 dark:hover:bg-[#1f1f1e]'}`}
            title='Dark'
            aria-pressed={theme === 'dark'}
            aria-label='Use dark theme'
          >
            <Moon className='w-4 h-4' aria-hidden='true' />
          </button>
          <button
            type='button'
            onClick={() => setTheme('light')}
            className={`px-2 py-1.5 transition-colors ${theme === 'light' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-gray-100 dark:hover:bg-[#1f1f1e]'}`}
            title='Light'
            aria-pressed={theme === 'light'}
            aria-label='Use light theme'
          >
            <Sun className='w-4 h-4' aria-hidden='true' />
          </button>
        </div>

        <a
          href='https://ac.bherila.net'
          target='_blank'
          rel="nofollow noopener noreferrer"
          className='hidden sm:inline-block px-3 py-1.5 rounded border border-gray-200 dark:border-[#3E3E3A] hover:bg-gray-50 dark:hover:bg-[#1f1f1e] text-sm'
        >
          ActiveCollab
        </a>

        {authenticated ? (
          <div className='relative' ref={userMenuRef}>
            <button
              type='button'
              onClick={() => setUserMenuOpen((v) => !v)}
              className='inline-flex items-center gap-2 px-3 py-1.5 rounded border border-gray-200 dark:border-[#3E3E3A] hover:bg-gray-50 dark:hover:bg-[#1f1f1e] text-sm text-gray-900 dark:text-[#E5E5E5]'
              aria-expanded={userMenuOpen}
              aria-haspopup='menu'
            >
              <div className='h-6 w-6 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-medium' aria-hidden='true'>
                {initials || 'U'}
              </div>
              <span className='hidden sm:inline'>{currentUser?.name ?? 'My Account'}</span>
              <ChevronDown className={`w-4 h-4 transition-transform text-gray-500 dark:text-[#A1A09A] ${userMenuOpen ? 'rotate-180' : ''}`} aria-hidden='true' />
            </button>

            {userMenuOpen && (
              <div
                role='menu'
                className='absolute right-0 z-50 mt-2 w-48 rounded-md border border-gray-200 dark:border-[#3E3E3A] bg-white dark:bg-[#161615] shadow-[0_10px_30px_rgba(0,0,0,0.08)] p-2'
              >
                <a
                  role='menuitem'
                  className='block px-3 py-2 rounded hover:bg-gray-50 dark:hover:bg-[#1f1f1e] text-sm text-gray-900 dark:text-[#E5E5E5]'
                  href='/dashboard'
                >
                  User Settings
                </a>
                <div className='my-1 border-t border-gray-100 dark:border-[#3E3E3A]' />
                <a
                  role='menuitem'
                  className='block px-3 py-2 rounded hover:bg-gray-50 dark:hover:bg-[#1f1f1e] text-sm text-red-600 dark:text-red-400'
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
          <a href='/login' className='px-3 py-1.5 rounded border border-gray-200 dark:border-[#3E3E3A] hover:bg-gray-50 dark:hover:bg-[#1f1f1e] text-sm'>Sign in</a>
        )}
      </div>
    </nav>
  );
}
