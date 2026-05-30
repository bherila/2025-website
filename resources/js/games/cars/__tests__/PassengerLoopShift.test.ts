import type { Passenger } from '../gameEngine'
import { type PassengerLoopSlot, planPassengerLoopSlots } from '../scene/passengerLoopSlots'
import type { QueueLayout } from '../scene/sceneTypes'

describe('passenger loop stability on boarding (no compaction)', () => {
  it('leaves surviving passengers in their exact slots when the front-most passenger boards', () => {
    const slots: PassengerLoopSlot[] = makeSlots(12)
    const initial = planPassengerLoopSlots({
      capacity: 12,
      layout: testLayout,
      now: 0,
      passengers: makePassengers(20),
      phase: 0,
      slots,
      spacing: 0.34,
      speed: 1,
    })

    expect(initial.slots.map((slot) => slot.passengerId)).toEqual(
      Array.from({ length: 12 }, (_, index) => `p${index + 1}`),
    )

    const afterBoarding = planPassengerLoopSlots({
      capacity: 12,
      layout: testLayout,
      now: 5,
      passengers: makePassengers(20).slice(1), // p1 boarded
      phase: 0,
      slots: initial.slots,
      spacing: 0.34,
      speed: 1,
    })

    // p2..p12 must keep their original slots and offsets — no shifting. The vacated
    // front slot (slot 0) is reserved for the next feeder passenger (p13), whose
    // walk-in is delayed until that slot rotates to the feeder join.
    expect(afterBoarding.slots[0]?.passengerId).toBe('p13')
    expect(afterBoarding.slots.slice(1).map((slot) => slot?.passengerId)).toEqual(
      Array.from({ length: 11 }, (_, index) => `p${index + 2}`),
    )
    for (const assignment of afterBoarding.assignments) {
      const initialOffset = initial.slots.find((slot) => slot.passengerId === assignment.passenger.id)?.offset
      if (initialOffset !== undefined) {
        expect(assignment.offset).toBe(initialOffset)
      }
    }
    const p13 = afterBoarding.assignments.find((assignment) => assignment.passenger.id === 'p13')
    expect(p13?.offset).toBe(initial.slots[0]?.offset)
    expect(p13?.entryStartedAt).toBeGreaterThan(5)
  })

  it('reserves each vacated slot in place when several passengers board at once', () => {
    const slots: PassengerLoopSlot[] = makeSlots(5)
    planPassengerLoopSlots({
      capacity: 5,
      layout: testLayout,
      now: 0,
      passengers: makePassengers(8),
      phase: 0,
      slots,
      spacing: 0.34,
      speed: 1,
    })

    const afterBoarding = planPassengerLoopSlots({
      capacity: 5,
      layout: testLayout,
      now: 10,
      passengers: makePassengers(8).slice(3), // p1, p2, p3 all boarded
      phase: 0,
      slots,
      spacing: 0.34,
      speed: 1,
    })

    // p4 and p5 keep slots 3 and 4; the three vacated front slots are refilled in place
    // by the next feeder passengers (p6, p7, p8) with delayed walk-ins.
    afterBoarding.slots.forEach((slot, index) => {
      expect(slot.offset).toBeCloseTo(-0.34 * (index + 1))
    })
    expect(afterBoarding.slots[3]?.passengerId).toBe('p4')
    expect(afterBoarding.slots[4]?.passengerId).toBe('p5')
    expect(afterBoarding.slots.slice(0, 3).map((slot) => slot.passengerId)).toEqual(['p6', 'p7', 'p8'])
    for (const id of ['p6', 'p7', 'p8']) {
      expect(afterBoarding.assignments.find((assignment) => assignment.passenger.id === id)?.entryStartedAt)
        .toBeGreaterThan(10)
    }
  })

  it('keeps a pending feeder entry pinned to its reserved slot offset across rebuilds', () => {
    const slots: PassengerLoopSlot[] = makeSlots(3)
    const firstBoarding = planPassengerLoopSlots({
      capacity: 3,
      layout: testLayout,
      now: 0,
      passengers: makePassengers(4).slice(1), // p1 boarded
      phase: 0,
      slots,
      spacing: 0.34,
      speed: 1,
    })

    const p4SlotAfterFirst = firstBoarding.slots.find((slot) => slot.passengerId === 'p4')
    expect(p4SlotAfterFirst?.offset).toBeCloseTo(-0.34) // the vacated front slot, unchanged
    const pendingEntryAfterFirst = p4SlotAfterFirst?.entryStartedAt
    expect(typeof pendingEntryAfterFirst).toBe('number')
    expect(pendingEntryAfterFirst as number).toBeGreaterThan(0)

    // p2 boards next, before p4 has walked in. p4 stays in its reserved slot/offset.
    const secondBoarding = planPassengerLoopSlots({
      capacity: 3,
      layout: testLayout,
      now: 0.4,
      passengers: makePassengers(4).slice(2), // p1, p2 boarded
      phase: 0.4,
      slots: firstBoarding.slots,
      spacing: 0.34,
      speed: 1,
    })

    const p4SlotAfterSecond = secondBoarding.slots.find((slot) => slot.passengerId === 'p4')
    expect(p4SlotAfterSecond?.offset).toBeCloseTo(-0.34)
    // The reserved slot did not move, so its scheduled walk-in time is preserved.
    expect(p4SlotAfterSecond?.entryStartedAt).toBe(pendingEntryAfterFirst)
  })
})

const testLayout: QueueLayout = {
  capRadius: 1,
  depth: 2.7,
  halfDepth: 1,
  halfWidth: 2,
  perimeter: 4 * 2 + Math.PI * 2,
  straightLength: 4,
  width: 4.7,
}

function makeSlots(count: number): PassengerLoopSlot[] {
  const slots: PassengerLoopSlot[] = []
  for (let index = 0; index < count; index += 1) {
    slots.push({
      entryStartedAt: null,
      passengerId: `p${index + 1}`,
      offset: -0.34 * (index + 1),
    })
  }

  return slots
}

function makePassengers(count: number): Passenger[] {
  const passengers: Passenger[] = []
  for (let index = 0; index < count; index += 1) {
    passengers.push({ id: `p${index + 1}`, color: 'red', feederSide: 'left' })
  }

  return passengers
}
