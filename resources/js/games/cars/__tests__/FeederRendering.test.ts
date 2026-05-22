import { selectFeederPassengersForRendering } from '../CarsScene'
import { generateLevel, loopPassengerCapacity, type Passenger } from '../gameEngine'
import { planPassengerLoopSlots } from '../scene/passengerLoopSlots'
import { passengerSpacing, queueLayoutForState } from '../scene/sceneGeometry'

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
})
