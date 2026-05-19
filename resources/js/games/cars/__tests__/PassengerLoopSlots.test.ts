import type { Passenger } from '../gameEngine'
import { type PassengerLoopSlot, planPassengerLoopSlots } from '../scene/passengerLoopSlots'
import type { QueueLayout } from '../scene/sceneTypes'

describe('passenger loop slots', () => {
  it('initially fills loop slots without feeder-entry delays', () => {
    const plan = planPassengerLoopSlots({
      capacity: 3,
      layout: testLayout,
      now: 12,
      passengers: [passenger('p1'), passenger('p2'), passenger('p3'), passenger('p4')],
      phase: 0,
      slots: [],
      spacing: 0.34,
      speed: 1,
    })

    expect(plan.slots.map((slot) => slot.passengerId)).toEqual(['p1', 'p2', 'p3'])
    expect(plan.assignments.map((assignment) => assignment.entryStartedAt)).toEqual([null, null, null])
    expect(plan.feederPassengers.map((item) => item.id)).toEqual(['p4'])
  })

  it('keeps a boarded passenger slot in place and refills it with a delayed feeder entry', () => {
    const slots: PassengerLoopSlot[] = [
      { entryStartedAt: null, passengerId: 'p1', offset: -0.34 },
      { entryStartedAt: null, passengerId: 'p2', offset: -0.68 },
      { entryStartedAt: null, passengerId: 'p3', offset: -1.02 },
    ]
    const plan = planPassengerLoopSlots({
      capacity: 3,
      layout: testLayout,
      now: 20,
      passengers: [passenger('p1'), passenger('p3'), passenger('p4')],
      phase: 0,
      slots,
      spacing: 0.34,
      speed: 1,
    })

    expect(plan.slots.map((slot) => slot.passengerId)).toEqual(['p1', 'p4', 'p3'])
    expect(plan.slots.map((slot) => slot.offset)).toEqual([-0.34, -0.68, -1.02])
    expect(plan.assignments.find((assignment) => assignment.passenger.id === 'p4')?.entryStartedAt).toBeGreaterThan(20)
    expect(plan.feederPassengers).toEqual([])
  })

  it('leaves an empty moving slot when no feeder passenger is available', () => {
    const slots: PassengerLoopSlot[] = [
      { entryStartedAt: null, passengerId: 'p1', offset: -0.34 },
      { entryStartedAt: null, passengerId: 'p2', offset: -0.68 },
      { entryStartedAt: null, passengerId: 'p3', offset: -1.02 },
    ]
    const plan = planPassengerLoopSlots({
      capacity: 3,
      layout: testLayout,
      now: 20,
      passengers: [passenger('p1'), passenger('p3')],
      phase: 0,
      slots,
      spacing: 0.34,
      speed: 1,
    })

    expect(plan.slots.map((slot) => slot.passengerId)).toEqual(['p1', null, 'p3'])
    expect(plan.slots.map((slot) => slot.offset)).toEqual([-0.34, -0.68, -1.02])
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

function passenger(id: string): Passenger {
  return { id, color: 'red', feederSide: 'left' }
}
