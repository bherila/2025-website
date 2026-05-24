import {
  findSolvingOrder,
  generateLevel,
  solverCompletesLevel,
  STARTING_REGULAR_SLOTS,
  validateParkingSolution,
} from '../gameEngine'

describe('cars game engine slow generator sweeps', () => {
  it('generates levels with queue-aware solutions that do not need extra slots', () => {
    for (let level = 1; level <= 100; level += 1) {
      const state = generateLevel(level)
      const order = findSolvingOrder(state)
      const solution = validateParkingSolution(state, order ?? [])

      if (!solverCompletesLevel(state)) {
        throw new Error(`Generated level ${level} is not board-solvable: ${state.lastMessage}`)
      }
      expect(order).not.toBeNull()
      if (!solution) {
        throw new Error(`Generated level ${level} has no queue-aware parking solution`)
      }
      expect(solution.maxRegularSlotsUsed).toBeLessThanOrEqual(STARTING_REGULAR_SLOTS)
      expect(state.passengerQueue.length).toBe(
        state.cars.reduce((total, car) => total + car.capacity, 0),
      )
    }
  })

  it('does not throw while generating a wide seed sweep', () => {
    for (let level = 1; level <= 50; level += 1) {
      for (const seedOffset of [0, 17, 113]) {
        expect(() => generateLevel(level, 10_000 + level + seedOffset)).not.toThrow()
      }
    }
  })
})
