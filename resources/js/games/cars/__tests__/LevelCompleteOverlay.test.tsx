import { render, screen } from '@testing-library/react'

import { LevelCompleteOverlay } from '../LevelCompleteOverlay'

describe('LevelCompleteOverlay', () => {
  it('shows score multiplier messaging for hard completions', () => {
    render(
      <LevelCompleteOverlay
        state={{
          completedLevel: {
            awardedPowerUp: 'vip',
            level: 5,
            score: 3100,
          },
          failedLevel: null,
        }}
        onNextLevel={jest.fn()}
        onRestart={jest.fn()}
      />,
    )

    expect(screen.getByText('HARD x2')).toBeInTheDocument()
    expect(screen.getByText('Level 5 Complete')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /next level/i })).toBeInTheDocument()
  })

  it('shows restart-only messaging for failed levels', () => {
    render(
      <LevelCompleteOverlay
        state={{
          completedLevel: null,
          failedLevel: {
            level: 8,
            reason: 'No moves left. Restart the level to try again.',
          },
        }}
        onNextLevel={jest.fn()}
        onRestart={jest.fn()}
      />,
    )

    expect(screen.getByText('Level 8 Failed')).toBeInTheDocument()
    expect(screen.getByText('No moves left. Restart the level to try again.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /restart level/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /next level/i })).not.toBeInTheDocument()
  })
})
