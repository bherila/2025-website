import type { Passenger } from '../gameEngine'
import { type PassengerLoopSlot, planPassengerLoopSlots } from '../scene/passengerLoopSlots'
import type { QueueLayout } from '../scene/sceneTypes'

describe('passenger loop shift on boarding', () => {
  it('puts the queues next-in-line passenger at the front slot (not the feeder front) after the front-most passenger boards', () => {
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
      passengers: makePassengers(20).slice(1),
      phase: 0,
      slots: initial.slots,
      spacing: 0.34,
      speed: 1,
    })

    expect(afterBoarding.slots[0]?.passengerId).toBe('p2')
    expect(afterBoarding.slots[11]?.passengerId).toBe('p13')
    expect(afterBoarding.slots.slice(0, 11).map((slot) => slot?.passengerId)).toEqual(
      ['p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10', 'p11', 'p12'],
    )

    const shiftedIds = afterBoarding.assignments
      .filter((assignment) => assignment.shift !== null)
      .map((assignment) => assignment.passenger.id)
    expect(shiftedIds).toEqual(['p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10', 'p11', 'p12'])

    const p2Assignment = afterBoarding.assignments.find((assignment) => assignment.passenger.id === 'p2')
    expect(p2Assignment?.shift?.previousOffset).toBeCloseTo(-0.68)
    expect(p2Assignment?.offset).toBeCloseTo(-0.34)
    expect(p2Assignment?.shift?.startedAt).toBe(5)
  })

  it('keeps relative loop order when multiple slots are vacated in the same plan call', () => {
    const slots: PassengerLoopSlot[] = makeSlots(5)
    const initial = planPassengerLoopSlots({
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
      // p1, p2, p3 all boarded
      passengers: makePassengers(8).slice(3),
      phase: 0,
      slots: initial.slots,
      spacing: 0.34,
      speed: 1,
    })

    expect(afterBoarding.slots.map((slot) => slot.passengerId)).toEqual(['p4', 'p5', 'p6', 'p7', 'p8'])
  })

  it('recomputes a pending feeder entryStartedAt against the new offset when the passenger is shifted again before joining', () => {
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
    expect(p4SlotAfterFirst?.offset).toBeCloseTo(-1.02)
    const pendingEntryAfterFirst = p4SlotAfterFirst?.entryStartedAt
    expect(typeof pendingEntryAfterFirst).toBe('number')
    expect(pendingEntryAfterFirst as number).toBeGreaterThan(0)

    // Now p2 (currently at front) boards before p4 has joined.
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
    expect(p4SlotAfterSecond?.offset).toBeCloseTo(-0.68)
    // entryStartedAt must be recomputed against the new (slot 1) offset and the
    // new `now`, not the stale slot-2 timestamp carried over from firstBoarding.
    expect(p4SlotAfterSecond?.entryStartedAt).not.toBe(pendingEntryAfterFirst)
    expect(p4SlotAfterSecond?.entryStartedAt as number).toBeGreaterThanOrEqual(0.4)
  })

  it('does not record a shift on the initial fill', () => {
    const plan = planPassengerLoopSlots({
      capacity: 3,
      layout: testLayout,
      now: 0,
      passengers: makePassengers(3),
      phase: 0,
      slots: [],
      spacing: 0.34,
      speed: 1,
    })

    expect(plan.assignments.every((assignment) => assignment.shift === null)).toBe(true)
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
