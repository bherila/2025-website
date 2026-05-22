import {
  CONVEYOR_ENTRY_PROGRESS,
  conveyorPhaseForTick,
} from '../scene/conveyorProgress'
import {
  entrySlotIndexForPhase,
  isSlotPassingStack,
  nearestSlotIndexForProgress,
  slotProgressDistance,
} from '../scene/conveyorSlots'

describe('conveyorSlots', () => {
  const SLOT_COUNT = 27

  it('places entrySlotIndexForPhase within half a slot of the funnel mouth', () => {
    for (let tick = 0; tick < SLOT_COUNT * 3; tick += 1) {
      const phase = conveyorPhaseForTick(tick, SLOT_COUNT)
      const slot = entrySlotIndexForPhase(phase, SLOT_COUNT)
      const distance = slotProgressDistance(phase, SLOT_COUNT, slot, CONVEYOR_ENTRY_PROGRESS)

      expect(distance).toBeLessThanOrEqual(0.5 / SLOT_COUNT + 1e-9)
    }
  })

  it('shifts the entry slot by one each belt tick', () => {
    const before = entrySlotIndexForPhase(conveyorPhaseForTick(0, SLOT_COUNT), SLOT_COUNT)
    const after = entrySlotIndexForPhase(conveyorPhaseForTick(1, SLOT_COUNT), SLOT_COUNT)
    const wrap = (value: number): number => (value + SLOT_COUNT) % SLOT_COUNT

    expect(wrap(before - after)).toBe(1)
  })

  it('nearestSlotIndexForProgress is stable across whole-cycle phase wraps', () => {
    const phase = conveyorPhaseForTick(5, SLOT_COUNT)
    const target = CONVEYOR_ENTRY_PROGRESS

    const direct = nearestSlotIndexForProgress(phase, SLOT_COUNT, target)
    const wrapped = nearestSlotIndexForProgress(phase + 3, SLOT_COUNT, target)
    const negative = nearestSlotIndexForProgress(phase - 2, SLOT_COUNT, target)

    expect(wrapped).toBe(direct)
    expect(negative).toBe(direct)
  })

  it('isSlotPassingStack only fires when the slot is within the stack drop window', () => {
    const phase = conveyorPhaseForTick(0, SLOT_COUNT)
    let inWindowFor = 0

    for (let slot = 0; slot < SLOT_COUNT; slot += 1) {
      if (isSlotPassingStack(phase, SLOT_COUNT, slot, 1, 3)) {
        inWindowFor += 1
      }
    }

    expect(inWindowFor).toBeGreaterThan(0)
    expect(inWindowFor).toBeLessThanOrEqual(2)
  })
})
