import { selectFeederPassengersForRendering } from '../CarsScene'
import { generateLevel, loopPassengerCapacity, type Passenger } from '../gameEngine'
import { type PassengerLoopSlot, planPassengerLoopSlots } from '../scene/passengerLoopSlots'
import { feederPassengerPosition, passengerSpacing, queueLayoutForState } from '../scene/sceneGeometry'
import type { QueueLayout } from '../scene/sceneTypes'

describe('feeder passenger rendering plan', () => {
  it('keeps both left and right feeder passengers in the plan, beyond the legacy 40-cap window', () => {
    const state = generateLevel(20, 12_345)
    const layout = queueLayoutForState(state)
    const capacity = loopPassengerCapacity(state)
    const plan = planPassengerLoopSlots({
      capacity,
      layout,
      now: 0,
      passengers: state.passengerQueue,
      phase: 0,
      slots: [],
      spacing: passengerSpacing(),
      speed: 1,
    })

    const feederPassengers: Passenger[] = plan.feederPassengers
    const leftCount = feederPassengers.filter((p) => p.feederSide === 'left').length
    const rightCount = feederPassengers.filter((p) => p.feederSide === 'right').length

    expect(feederPassengers.length).toBeGreaterThan(0)
    expect(leftCount).toBeGreaterThan(0)
    expect(rightCount).toBeGreaterThan(0)

    const renderedFeederPassengers = selectFeederPassengersForRendering(feederPassengers)
    const legacyCap = feederPassengers.slice(0, 40)
    const rightSideBeyondLegacyCap = feederPassengers.filter((passenger, index) => (
      passenger.feederSide === 'right' && index >= 40
    ))

    expect(feederPassengers.length).toBeGreaterThan(40)
    expect(rightSideBeyondLegacyCap.length).toBeGreaterThan(0)
    expect(renderedFeederPassengers.map((passenger) => passenger.id)).toEqual(
      feederPassengers.map((passenger) => passenger.id),
    )
    expect(
      rightSideBeyondLegacyCap.some((passenger) => !legacyCap.some((candidate) => candidate.id === passenger.id)),
    ).toBe(true)
  })

  it('keeps rendered feeder passengers behind pending feeder-entry passengers', () => {
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

    const enteringPassenger = plan.feederLayoutPassengers[0]
    const firstRenderedFeederPassenger = plan.feederPassengers[0]
    if (!enteringPassenger || !firstRenderedFeederPassenger) {
      throw new Error('Expected pending entry and rendered feeder passenger')
    }

    const enteringPosition = feederPassengerPosition(enteringPassenger, plan.feederLayoutPassengers, testLayout)
    const renderedPosition = feederPassengerPosition(
      firstRenderedFeederPassenger,
      plan.feederLayoutPassengers,
      testLayout,
    )
    const overlappingPosition = feederPassengerPosition(
      firstRenderedFeederPassenger,
      plan.feederPassengers,
      testLayout,
    )

    expect(renderedPosition.distanceTo(enteringPosition)).toBeGreaterThan(0.2)
    expect(overlappingPosition.distanceTo(enteringPosition)).toBeLessThan(0.01)
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
