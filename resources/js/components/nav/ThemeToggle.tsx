import { Laptop, Moon, Sun } from 'lucide-react'

import type { ThemeMode } from '@/hooks/useTheme'

interface ThemeToggleProps {
  theme: ThemeMode
  onThemeChange: (theme: ThemeMode) => void
}

export function ThemeToggle({ theme, onThemeChange }: ThemeToggleProps) {
  return (
    <div className='inline-flex items-center overflow-hidden rounded-md border border-border' role='group' aria-label='Color theme'>
      <button
        type='button'
        onClick={() => onThemeChange('system')}
        className={`px-2 py-1.5 transition-colors ${theme === 'system' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'}`}
        title='System'
        aria-pressed={theme === 'system'}
        aria-label='Use system theme'
      >
        <Laptop className='w-4 h-4' aria-hidden='true' />
      </button>
      <button
        type='button'
        onClick={() => onThemeChange('dark')}
        className={`px-2 py-1.5 transition-colors ${theme === 'dark' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'}`}
        title='Dark'
        aria-pressed={theme === 'dark'}
        aria-label='Use dark theme'
      >
        <Moon className='w-4 h-4' aria-hidden='true' />
      </button>
      <button
        type='button'
        onClick={() => onThemeChange('light')}
        className={`px-2 py-1.5 transition-colors ${theme === 'light' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'}`}
        title='Light'
        aria-pressed={theme === 'light'}
        aria-label='Use light theme'
      >
        <Sun className='w-4 h-4' aria-hidden='true' />
      </button>
    </div>
  )
}
