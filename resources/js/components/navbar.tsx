import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { Laptop, Moon, Sun, ChevronDown } from 'lucide-react';

type NavbarProps = {
  authenticated: boolean;
  isAdmin: boolean;
};

type ThemeMode = 'system' | 'dark' | 'light';

function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = mode === 'dark' || (mode === 'system' && prefersDark);
  root.classList.toggle('dark', isDark);
}

export default function Navbar({ authenticated, isAdmin }: NavbarProps) {
  const [toolsOpen, setToolsOpen] = useState(false);
  const toolsRef = useRef<HTMLLIElement | null>(null);
  const [theme, setTheme] = useState<ThemeMode>(() => (localStorage.getItem('theme') as ThemeMode) || 'system');

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!toolsRef.current) return;
      if (!toolsRef.current.contains(e.target as Node)) setToolsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

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
        <a href='/' className='select-none'>
          <h1 className='text-lg font-semibold tracking-tight'>Ben Herila</h1>
        </a>
        <ul className='hidden md:flex items-center gap-4 text-sm'>
          <li><a className='hover:underline underline-offset-4' href='/recipes'>Recipes</a></li>
          <li><a className='hover:underline underline-offset-4' href='/projects'>Projects</a></li>
          <li ref={toolsRef} className='relative'>
            <button
              type='button'
              className='inline-flex items-center gap-1 hover:underline underline-offset-4'
              onClick={() => setToolsOpen((v) => !v)}
              aria-expanded={toolsOpen}
              aria-haspopup='menu'
            >
              Tools <ChevronDown className='w-4 h-4' />
            </button>
            {toolsOpen && (
              <div
                role='menu'
                className='absolute z-50 mt-2 w-64 rounded-md border border-gray-200 dark:border-[#3E3E3A] bg-white dark:bg-[#161615] shadow-[0_10px_30px_rgba(0,0,0,0.08)] p-2'
              >
                <div className='px-2 py-1 text-xs uppercase tracking-wide text-gray-500 dark:text-[#A1A09A]'>Finance</div>
                <a className='block px-3 py-2 rounded hover:bg-gray-50 dark:hover:bg-[#1f1f1e]' href='/finance/rsu'>Finance RSU</a>
                <a className='block px-3 py-2 rounded hover:bg-gray-50 dark:hover:bg-[#1f1f1e]' href='/finance/payslips'>Finance Payslips</a>
                <a className='block px-3 py-2 rounded hover:bg-gray-50 dark:hover:bg-[#1f1f1e]' href='/finance/accounts'>Finance Accounts</a>
                <div className='px-2 pt-3 pb-1 text-xs uppercase tracking-wide text-gray-500 dark:text-[#A1A09A]'>Utilities</div>
                <a className='block px-3 py-2 rounded hover:bg-gray-50 dark:hover:bg-[#1f1f1e]' href='/tools/maxmin'>MaxMin</a>
                <a className='block px-3 py-2 rounded hover:bg-gray-50 dark:hover:bg-[#1f1f1e]' href='/tools/license-manager'>License Manager</a>
                <a className='block px-3 py-2 rounded hover:bg-gray-50 dark:hover:bg-[#1f1f1e]' href='/tools/bingo'>Bingo Card Generator</a>
                <a className='block px-3 py-2 rounded hover:bg-gray-50 dark:hover:bg-[#1f1f1e]' href='/tools/irs-f461'>Capital Loss Carryover Worksheet</a>
                {authenticated && isAdmin && (
                  <>
                    <div className='px-2 pt-3 pb-1 text-xs uppercase tracking-wide text-gray-500 dark:text-[#A1A09A]'>Admin</div>
                    <a className='block px-3 py-2 rounded hover:bg-gray-50 dark:hover:bg-[#1f1f1e]' href='/admin/users'>User Management</a>
                    <a className='block px-3 py-2 rounded hover:bg-gray-50 dark:hover:bg-[#1f1f1e]' href='/client/mgmt'>Client Management</a>
                  </>
                )}
              </div>
            )}
          </li>
        </ul>
      </div>

      {/* Right: Theme toggle + external link + auth */}
      <div className='flex items-center gap-3'>
        {/* Tri-state theme toggle */}
        <div className='inline-flex items-center overflow-hidden rounded-md border border-gray-200 dark:border-[#3E3E3A]'>
          <button
            type='button'
            onClick={() => setTheme('system')}
            className={`px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-[#1f1f1e] ${theme === 'system' ? 'bg-gray-100 dark:bg-[#262625]' : ''}`}
            title='System'
            aria-pressed={theme === 'system'}
          >
            <Laptop className='w-4 h-4' />
          </button>
          <button
            type='button'
            onClick={() => setTheme('dark')}
            className={`px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-[#1f1f1e] ${theme === 'dark' ? 'bg-gray-100 dark:bg-[#262625]' : ''}`}
            title='Dark'
            aria-pressed={theme === 'dark'}
          >
            <Moon className='w-4 h-4' />
          </button>
          <button
            type='button'
            onClick={() => setTheme('light')}
            className={`px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-[#1f1f1e] ${theme === 'light' ? 'bg-gray-100 dark:bg-[#262625]' : ''}`}
            title='Light'
            aria-pressed={theme === 'light'}
          >
            <Sun className='w-4 h-4' />
          </button>
        </div>

        <a
          href='https://ac.bherila.net'
          target='_blank'
          rel='nofollow noopener'
          className='hidden sm:inline-block px-3 py-1.5 rounded border border-gray-200 dark:border-[#3E3E3A] hover:bg-gray-50 dark:hover:bg-[#1f1f1e] text-sm'
        >
          ActiveCollab
        </a>

        {authenticated ? (
          <a href='/dashboard' className='px-3 py-1.5 rounded bg-slate-900 text-white hover:bg-slate-900/90 text-sm'>My Account</a>
        ) : (
          <a href='/login' className='px-3 py-1.5 rounded border border-gray-200 dark:border-[#3E3E3A] hover:bg-gray-50 dark:hover:bg-[#1f1f1e] text-sm'>Sign in</a>
        )}
      </div>
    </nav>
  );
}
