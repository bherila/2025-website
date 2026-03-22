'use client'

interface ClearFilterButtonProps {
  onClick: () => void
  ariaLabel: string
}

export const ClearFilterButton = ({ onClick, ariaLabel }: ClearFilterButtonProps) => (
  <button
    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 hover:bg-accent"
    onClick={onClick}
    style={{ cursor: 'pointer' }}
    aria-label={ariaLabel}
  >
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  </button>
)
