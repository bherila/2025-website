import { ChevronDown, Laptop, Menu, Moon, Sun, X } from 'lucide-react';
import * as React from 'react';
import { useEffect, useRef, useState } from 'react';

type ClientCompany = {
  id: number;
  company_name: string;
  slug: string;
};

type NavbarProps = {
  authenticated: boolean;
  isAdmin: boolean;
  clientCompanies?: ClientCompany[];
  currentUser?: { id: number; name: string; email: string; user_role?: string | null; last_login_date?: string | null } | null;
};

type ThemeMode = 'system' | 'dark' | 'light';

function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = mode === 'dark' || (mode === 'system' && prefersDark);
  root.classList.toggle('dark', isDark);
}

export default function Navbar({ authenticated, isAdmin, clientCompanies, currentUser }: NavbarProps) {
  const [financeOpen, setFinanceOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const initials = currentUser && currentUser.name 
    ? currentUser.name.trim().split(/\s+/).map(p => p[0]).filter(Boolean).slice(0,2).join('').toUpperCase() 
    : '';

  const financeRef = useRef<HTMLLIElement | null>(null);
  const toolsRef = useRef<HTMLLIElement | null>(null);
  
  const [clientsOpen, setClientsOpen] = useState(false);
  const clientsRef = useRef<HTMLLIElement | null>(null);

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileFinanceOpen, setMobileFinanceOpen] = useState(false);
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);
  const [mobileClientsOpen, setMobileClientsOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement | null>(null);

  const [theme, setTheme] = useState<ThemeMode>(() => (localStorage.getItem('theme') as ThemeMode) || 'system');

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (financeRef.current && !financeRef.current.contains(e.target as Node)) {
        setFinanceOpen(false);
      }
      if (toolsRef.current && !toolsRef.current.contains(e.target as Node)) {
        setToolsOpen(false);
      }
      if (clientsRef.current && !clientsRef.current.contains(e.target as Node)) {
        setClientsOpen(false);
      }
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(e.target as Node)) {
        setMobileMenuOpen(false);
        setMobileFinanceOpen(false);
        setMobileToolsOpen(false);
        setMobileClientsOpen(false);
      }
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
          <li><a className='hover:underline underline-offset-4' href='/recipes'>Recipes</a></li>
          <li><a className='hover:underline underline-offset-4' href='/projects'>Projects</a></li>
          {authenticated && (
            <li ref={financeRef} className='relative'>
              <button
                type='button'
                className='inline-flex items-center gap-1 hover:underline underline-offset-4'
                onClick={() => setFinanceOpen((v) => !v)}
                aria-expanded={financeOpen}
                aria-haspopup='menu'
                id='finance-menu-button'
              >
                Finance <ChevronDown className='w-4 h-4' aria-hidden='true' />
              </button>
              {financeOpen && (
                <div
                  role='menu'
                  aria-labelledby='finance-menu-button'
                  className='absolute z-50 mt-2 w-56 rounded-md border border-gray-200 dark:border-[#3E3E3A] bg-white dark:bg-[#161615] shadow-[0_10px_30px_rgba(0,0,0,0.08)] p-2'
                >
                  <a role='menuitem' className='block px-3 py-2 rounded hover:bg-gray-50 dark:hover:bg-[#1f1f1e]' href='/finance/accounts'>Accounts</a>
                  <a role='menuitem' className='block px-3 py-2 rounded hover:bg-gray-50 dark:hover:bg-[#1f1f1e]' href='/finance/all-transactions'>Transactions</a>
                  <a role='menuitem' className='block px-3 py-2 rounded hover:bg-gray-50 dark:hover:bg-[#1f1f1e]' href='/finance/tax-preview'>Tax Preview</a>
                  <a role='menuitem' className='block px-3 py-2 rounded hover:bg-gray-50 dark:hover:bg-[#1f1f1e]' href='/finance/rsu'>RSU</a>
                  <a role='menuitem' className='block px-3 py-2 rounded hover:bg-gray-50 dark:hover:bg-[#1f1f1e]' href='/finance/payslips'>Payslips</a>
                  <a role='menuitem' className='block px-3 py-2 rounded hover:bg-gray-50 dark:hover:bg-[#1f1f1e]' href='/utility-bill-tracker'>Utility Bill Tracker</a>
                </div>
              )}
            </li>
          )}
          <li ref={toolsRef} className='relative'>
            <button
              type='button'
              className='inline-flex items-center gap-1 hover:underline underline-offset-4'
              onClick={() => setToolsOpen((v) => !v)}
              aria-expanded={toolsOpen}
              aria-haspopup='menu'
              id='tools-menu-button'
            >
              Tools <ChevronDown className='w-4 h-4' aria-hidden='true' />
            </button>
            {toolsOpen && (
              <div
                role='menu'
                aria-labelledby='tools-menu-button'
                className='absolute z-50 mt-2 w-64 rounded-md border border-gray-200 dark:border-[#3E3E3A] bg-white dark:bg-[#161615] shadow-[0_10px_30px_rgba(0,0,0,0.08)] p-2'
              >
                <div className='px-2 py-1 text-xs uppercase tracking-wide text-gray-500 dark:text-[#A1A09A]' aria-hidden='true'>Utilities</div>
                <a role='menuitem' className='block px-3 py-2 rounded hover:bg-gray-50 dark:hover:bg-[#1f1f1e]' href='/tools/license-manager'>License Manager</a>
                <a role='menuitem' className='block px-3 py-2 rounded hover:bg-gray-50 dark:hover:bg-[#1f1f1e]' href='/tools/bingo'>Bingo Card Generator</a>
                <a role='menuitem' className='block px-3 py-2 rounded hover:bg-gray-50 dark:hover:bg-[#1f1f1e]' href='/tools/irs-f461'>Capital Loss Carryover Worksheet</a>
                {authenticated && isAdmin && (
                  <>
                    <div className='px-2 pt-3 pb-1 text-xs uppercase tracking-wide text-gray-500 dark:text-[#A1A09A]' aria-hidden='true'>Admin</div>
                    <a role='menuitem' className='block px-3 py-2 rounded hover:bg-gray-50 dark:hover:bg-[#1f1f1e]' href='/admin/users'>User Management</a>
                    <a role='menuitem' className='block px-3 py-2 rounded hover:bg-gray-50 dark:hover:bg-[#1f1f1e]' href='/client/mgmt'>Client Management</a>
                  </>
                )}
              </div>
            )}
          </li>
          {authenticated && clientCompanies && clientCompanies.length > 0 && (
            <li ref={clientsRef} className='relative'>
              <button
                type='button'
                className='inline-flex items-center gap-1 hover:underline underline-offset-4'
                onClick={() => setClientsOpen((v) => !v)}
                aria-expanded={clientsOpen}
                aria-haspopup='menu'
                id='client-portal-menu-button'
              >
                Client Portal <ChevronDown className='w-4 h-4' aria-hidden='true' />
              </button>
              {clientsOpen && (
                <div
                  role='menu'
                  aria-labelledby='client-portal-menu-button'
                  className='absolute z-50 mt-2 w-64 rounded-md border border-gray-200 dark:border-[#3E3E3A] bg-white dark:bg-[#161615] shadow-[0_10px_30px_rgba(0,0,0,0.08)] p-2'
                >
                  {clientCompanies.map((company) => (
                    <a
                      key={company.id}
                      role='menuitem'
                      className='block px-3 py-2 rounded hover:bg-gray-50 dark:hover:bg-[#1f1f1e] truncate'
                      href={`/client/portal/${company.slug}`}
                    >
                      {company.company_name}
                    </a>
                  ))}
                  {isAdmin && (
                    <>
                      <div className='my-1 border-t border-gray-100 dark:border-[#3E3E3A]' />
                      <a
                        role='menuitem'
                        className='block px-3 py-2 rounded hover:bg-gray-50 dark:hover:bg-[#1f1f1e]'
                        href='/client/mgmt'
                      >
                        All Companies
                      </a>
                    </>
                  )}
                </div>
              )}
            </li>
          )}
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
            <a className='block px-3 py-2 rounded hover:bg-gray-50 dark:hover:bg-[#1f1f1e] text-base' href='/recipes'>
              Recipes
            </a>
            <a className='block px-3 py-2 rounded hover:bg-gray-50 dark:hover:bg-[#1f1f1e] text-base' href='/projects'>
              Projects
            </a>

            {/* Finance section in mobile menu */}
            {authenticated && (
              <div>
                <button
                  type='button'
                  className='w-full flex items-center justify-between px-3 py-2 rounded hover:bg-gray-50 dark:hover:bg-[#1f1f1e] text-base'
                  onClick={() => setMobileFinanceOpen((v) => !v)}
                  aria-expanded={mobileFinanceOpen}
                  aria-controls='mobile-finance-menu'
                >
                  <span>Finance</span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${mobileFinanceOpen ? 'rotate-180' : ''}`} aria-hidden='true' />
                </button>
                {mobileFinanceOpen && (
                  <div id='mobile-finance-menu' className='pl-4 space-y-1'>
                    <a className='block px-3 py-2 rounded hover:bg-gray-50 dark:hover:bg-[#1f1f1e] text-sm' href='/finance/accounts'>
                      Accounts
                    </a>
                    <a className='block px-3 py-2 rounded hover:bg-gray-50 dark:hover:bg-[#1f1f1e] text-sm' href='/finance/all-transactions'>
                      Transactions
                    </a>
                    <a className='block px-3 py-2 rounded hover:bg-gray-50 dark:hover:bg-[#1f1f1e] text-sm' href='/finance/tax-preview'>
                      Tax Preview
                    </a>
                    <a className='block px-3 py-2 rounded hover:bg-gray-50 dark:hover:bg-[#1f1f1e] text-sm' href='/finance/rsu'>
                      RSU
                    </a>
                    <a className='block px-3 py-2 rounded hover:bg-gray-50 dark:hover:bg-[#1f1f1e] text-sm' href='/finance/payslips'>
                      Payslips
                    </a>
                    <a className='block px-3 py-2 rounded hover:bg-gray-50 dark:hover:bg-[#1f1f1e] text-sm' href='/utility-bill-tracker'>
                      Utility Bill Tracker
                    </a>
                  </div>
                )}
              </div>
            )}
            
            {/* Tools section in mobile menu */}
            <div>
              <button
                type='button'
                className='w-full flex items-center justify-between px-3 py-2 rounded hover:bg-gray-50 dark:hover:bg-[#1f1f1e] text-base'
                onClick={() => setMobileToolsOpen((v) => !v)}
                aria-expanded={mobileToolsOpen}
                aria-controls='mobile-tools-menu'
              >
                <span>Tools</span>
                <ChevronDown className={`w-4 h-4 transition-transform ${mobileToolsOpen ? 'rotate-180' : ''}`} aria-hidden='true' />
              </button>
              {mobileToolsOpen && (
                <div id='mobile-tools-menu' className='pl-4 space-y-1'>
                  <div className='px-3 py-1 text-xs uppercase tracking-wide text-gray-500 dark:text-[#A1A09A]' aria-hidden='true'>Utilities</div>
                  <a className='block px-3 py-2 rounded hover:bg-gray-50 dark:hover:bg-[#1f1f1e] text-sm' href='/tools/license-manager'>
                    License Manager
                  </a>
                  <a className='block px-3 py-2 rounded hover:bg-gray-50 dark:hover:bg-[#1f1f1e] text-sm' href='/tools/bingo'>
                    Bingo Card Generator
                  </a>
                  <a className='block px-3 py-2 rounded hover:bg-gray-50 dark:hover:bg-[#1f1f1e] text-sm' href='/tools/irs-f461'>
                    Capital Loss Carryover Worksheet
                  </a>
                  {authenticated && isAdmin && (
                    <>
                      <div className='px-3 pt-2 pb-1 text-xs uppercase tracking-wide text-gray-500 dark:text-[#A1A09A]' aria-hidden='true'>Admin</div>
                      <a className='block px-3 py-2 rounded hover:bg-gray-50 dark:hover:bg-[#1f1f1e] text-sm' href='/admin/users'>
                        User Management
                      </a>
                      <a className='block px-3 py-2 rounded hover:bg-gray-50 dark:hover:bg-[#1f1f1e] text-sm' href='/client/mgmt'>
                        Client Management
                      </a>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Client Portal section in mobile menu */}
            {authenticated && clientCompanies && clientCompanies.length > 0 && (
              <div>
                <button
                  type='button'
                  className='w-full flex items-center justify-between px-3 py-2 rounded hover:bg-gray-50 dark:hover:bg-[#1f1f1e] text-base'
                  onClick={() => setMobileClientsOpen((v) => !v)}
                  aria-expanded={mobileClientsOpen}
                  aria-controls='mobile-clients-menu'
                >
                  <span>Client Portal</span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${mobileClientsOpen ? 'rotate-180' : ''}`} aria-hidden='true' />
                </button>
                {mobileClientsOpen && (
                  <div id='mobile-clients-menu' className='pl-4 space-y-1'>
                    {clientCompanies.map((company) => (
                      <a
                        key={company.id}
                        className='block px-3 py-2 rounded hover:bg-gray-50 dark:hover:bg-[#1f1f1e] text-sm truncate'
                        href={`/client/portal/${company.slug}`}
                      >
                        {company.company_name}
                      </a>
                    ))}
                    {isAdmin && (
                      <>
                        <div className='my-1 border-t border-gray-100 dark:border-[#3E3E3A]' />
                        <a
                          className='block px-3 py-2 rounded hover:bg-gray-50 dark:hover:bg-[#1f1f1e] text-sm'
                          href='/client/mgmt'
                        >
                          All Companies
                        </a>
                      </>
                    )}
                  </div>
                )}
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
          <a href='/dashboard' className='inline-flex items-center gap-2 px-3 py-1.5 rounded border border-gray-200 dark:border-[#3E3E3A] hover:bg-gray-50 dark:hover:bg-[#1f1f1e] text-sm'>
            <div className='h-6 w-6 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-medium' aria-hidden='true'>
              {initials || 'U'}
            </div>
            <span className='hidden sm:inline'>{currentUser?.name ?? 'My Account'}</span>
          </a>
        ) : (
          <a href='/login' className='px-3 py-1.5 rounded border border-gray-200 dark:border-[#3E3E3A] hover:bg-gray-50 dark:hover:bg-[#1f1f1e] text-sm'>Sign in</a>
        )}
      </div>
    </nav>
  );
}
