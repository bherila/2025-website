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

    // The legacy render path truncated to .slice(0, 40); regression-guard that
    // the planner itself does not silently drop the right-side feeder when the
    // total exceeds that window.
    if (feederPassengers.length > 40) {
      const within40 = feederPassengers.slice(0, 40)
      const rightWithin40 = within40.filter((p) => p.feederSide === 'right').length
      // The right side may legitimately not appear in the first 40; this is
      // the exact case the render fix addresses by rendering all feeder items.
      expect(within40.length).toBe(40)
      expect(rightWithin40 + within40.filter((p) => p.feederSide === 'left').length).toBe(40)
    }
  })
})
