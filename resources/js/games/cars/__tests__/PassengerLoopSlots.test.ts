import type { Passenger } from '../gameEngine'
import {
  PASSENGER_LOOP_ENTRY_RETENTION_SECONDS,
  type PassengerLoopSlot,
  planPassengerLoopSlots,
} from '../scene/passengerLoopSlots'
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

  it('shifts later loop passengers forward when an earlier slot is vacated and lands the new feeder passenger in the back slot', () => {
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

    expect(plan.slots.map((slot) => slot.passengerId)).toEqual(['p1', 'p3', 'p4'])
    expect(plan.slots.map((slot) => slot.offset)).toEqual([-0.34, -0.68, -1.02])
    const p3Assignment = plan.assignments.find((assignment) => assignment.passenger.id === 'p3')
    expect(p3Assignment?.shift).toEqual({ previousOffset: -1.02, startedAt: 20 })
    expect(p3Assignment?.entryStartedAt).toBeNull()
    expect(plan.assignments.find((assignment) => assignment.passenger.id === 'p4')?.entryStartedAt).toBeGreaterThan(20)
    expect(plan.feederPassengers).toEqual([])
  })

  it('reserves feeder head layout space for pending loop-entry passengers', () => {
    const slots: PassengerLoopSlot[] = [
      { entryStartedAt: null, passengerId: 'p1', offset: -0.34 },
      { entryStartedAt: null, passengerId: 'p2', offset: -0.68 },
      { entryStartedAt: null, passengerId: 'p3', offset: -1.02 },
    ]
    const plan = planPassengerLoopSlots({
      capacity: 3,
      layout: testLayout,
      now: 20,
      passengers: [passenger('p1'), passenger('p3'), passenger('p4'), passenger('p5')],
      phase: 0,
      slots,
      spacing: 0.34,
      speed: 1,
    })

    expect(plan.slots.map((slot) => slot.passengerId)).toEqual(['p1', 'p3', 'p4'])
    expect(plan.assignments.find((assignment) => assignment.passenger.id === 'p4')?.entryStartedAt)
      .toBeGreaterThan(20)
    expect(plan.feederPassengers.map((item) => item.id)).toEqual(['p5'])
    expect(plan.feederLayoutPassengers.map((item) => item.id)).toEqual(['p4', 'p5'])
  })

  it('releases feeder head layout space after the loop-entry retention window', () => {
    const slots: PassengerLoopSlot[] = [
      { entryStartedAt: null, passengerId: 'p1', offset: -0.34 },
      { entryStartedAt: null, passengerId: 'p2', offset: -0.68 },
      { entryStartedAt: null, passengerId: 'p3', offset: -1.02 },
    ]
    const pendingPlan = planPassengerLoopSlots({
      capacity: 3,
      layout: testLayout,
      now: 20,
      passengers: [passenger('p1'), passenger('p3'), passenger('p4'), passenger('p5')],
      phase: 0,
      slots,
      spacing: 0.34,
      speed: 1,
    })
    const p4Slot = pendingPlan.slots.find((slot) => slot.passengerId === 'p4')
    if (p4Slot?.entryStartedAt === null || p4Slot?.entryStartedAt === undefined) {
      throw new Error('Expected p4 to have a delayed feeder entry')
    }

    const releasedPlan = planPassengerLoopSlots({
      capacity: 3,
      layout: testLayout,
      now: p4Slot.entryStartedAt + PASSENGER_LOOP_ENTRY_RETENTION_SECONDS + 0.01,
      passengers: [passenger('p1'), passenger('p3'), passenger('p4'), passenger('p5')],
      phase: 0,
      slots: pendingPlan.slots,
      spacing: 0.34,
      speed: 1,
    })

    expect(releasedPlan.feederPassengers.map((item) => item.id)).toEqual(['p5'])
    expect(releasedPlan.feederLayoutPassengers.map((item) => item.id)).toEqual(['p5'])
  })

  it('leaves the trailing slot empty when no feeder passenger is available', () => {
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

    expect(plan.slots.map((slot) => slot.passengerId)).toEqual(['p1', 'p3', null])
    expect(plan.slots.map((slot) => slot.offset)).toEqual([-0.34, -0.68, -1.02])
    expect(plan.assignments.find((assignment) => assignment.passenger.id === 'p3')?.shift)
      .toEqual({ previousOffset: -1.02, startedAt: 20 })
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
