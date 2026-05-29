import * as THREE from 'three'

import { canBoardPassengerAtParkingGate, type Car, type GameState, type ParkingSlot } from '../gameEngine'
import { createPassengerEntryAnimation, notifyPassengerGate, type PassengerGateHold } from '../scene/animation/passengers'
import type { MovingCarRenderItem, PassengerRenderItem, QueueLayout } from '../scene/sceneTypes'

describe('passenger gate notifications', () => {
  it('does not board passengers before their delayed feeder entry completes', () => {
    const passenger: PassengerRenderItem = {
      entry: {
        duration: 1,
        from: new THREE.Vector3(),
        startedAt: 10,
      },
      id: 'p1',
      layout: testLayout,
      mesh: new THREE.Group(),
      offset: 0,
    }
    const onPassengerGate = jest.fn()

    notifyPassengerGate([passenger], 0, new Map([['p1', -1]]), testState, [], 10.5, onPassengerGate)

    expect(onPassengerGate).not.toHaveBeenCalled()

    notifyPassengerGate([passenger], 0, new Map([['p1', -1]]), testState, [], 11.1, onPassengerGate)

    expect(onPassengerGate).toHaveBeenCalledWith('p1')
  })

  it('never boards a feeder passenger even when its colour matches a parked car', () => {
    const mixedState: GameState = {
      ...testState,
      passengerQueue: [
        { color: 'red', id: 'loop-red' },
        { color: 'green', id: 'feeder-green' },
      ],
      cars: [parkedCar, parkedGreenCar],
      parkingSlots: [parkingSlot, greenParkingSlot],
    }
    const loopPassenger: PassengerRenderItem = {
      id: 'loop-red',
      layout: testLayout,
      mesh: new THREE.Group(),
      offset: 0,
    }
    const feederPassenger: PassengerRenderItem = {
      fixedTarget: new THREE.Vector3(3, 0, 0),
      id: 'feeder-green',
      layout: testLayout,
      mesh: new THREE.Group(),
      offset: 0,
    }
    const onPassengerGate = jest.fn()

    for (let step = 0; step < 8; step += 1) {
      const phase = step * testLayout.perimeter * 0.5
      notifyPassengerGate(
        [loopPassenger, feederPassenger],
        phase,
        new Map(),
        mixedState,
        [],
        step + 0.1,
        onPassengerGate,
      )
    }

    expect(onPassengerGate).not.toHaveBeenCalledWith('feeder-green')
    expect(onPassengerGate).toHaveBeenCalledWith('loop-red')
  })

  it('boards a held gate passenger when their matching parked car finishes moving', () => {
    const passenger: PassengerRenderItem = {
      id: 'p1',
      layout: testLayout,
      mesh: new THREE.Group(),
      offset: 0,
    }
    const gateCycles = new Map([['p1', -1]])
    const gateHolds = new Map<string, PassengerGateHold>()
    const onPassengerGate = jest.fn()

    notifyPassengerGate(
      [passenger],
      0,
      gateCycles,
      testState,
      [parkingMovement()],
      10.5,
      onPassengerGate,
      gateHolds,
    )

    expect(onPassengerGate).not.toHaveBeenCalled()
    expect(gateCycles.get('p1')).toBe(-1)
    expect(gateHolds.get('p1')).toEqual({ cycle: 0, expiresAt: 11.75 })

    notifyPassengerGate(
      [passenger],
      0.8,
      gateCycles,
      testState,
      [parkingMovement()],
      11.1,
      onPassengerGate,
      gateHolds,
    )

    expect(onPassengerGate).toHaveBeenCalledWith('p1')
    expect(gateCycles.get('p1')).toBe(0)
    expect(gateHolds.has('p1')).toBe(false)
  })

  it('expires held gate crossings instead of boarding after the passenger has moved on', () => {
    const passenger: PassengerRenderItem = {
      id: 'p1',
      layout: testLayout,
      mesh: new THREE.Group(),
      offset: 0,
    }
    const gateCycles = new Map([['p1', -1]])
    const gateHolds = new Map<string, PassengerGateHold>()
    const onPassengerGate = jest.fn()

    notifyPassengerGate(
      [passenger],
      0,
      gateCycles,
      testState,
      [parkingMovement()],
      10.5,
      onPassengerGate,
      gateHolds,
    )
    notifyPassengerGate(
      [passenger],
      0.8,
      gateCycles,
      testState,
      [parkingMovement()],
      12.1,
      onPassengerGate,
      gateHolds,
    )

    expect(onPassengerGate).not.toHaveBeenCalled()
    expect(gateCycles.get('p1')).toBe(0)
    expect(gateHolds.has('p1')).toBe(false)
  })

  it('boards a passenger shifted just past the gate on the same pass (no extra loop)', () => {
    const passenger: PassengerRenderItem = {
      id: 'p1',
      layout: testLayout,
      mesh: new THREE.Group(),
      offset: 0,
    }
    const onPassengerGate = jest.fn()

    // A loop shift reseeds the gate cycle to the current cycle (so crossedGate is
    // false) and can carry the passenger a full slot past the gate. Progress 0.4 is
    // beyond the old narrow window but the match is ready, so it must still board.
    notifyPassengerGate([passenger], 0.4, new Map([['p1', 0]]), testState, [], 20, onPassengerGate)

    expect(onPassengerGate).toHaveBeenCalledWith('p1')
  })

  it('consumes gate crossings when no matching parked car exists', () => {
    const bluePassenger: PassengerRenderItem = {
      id: 'blue-loop',
      layout: testLayout,
      mesh: new THREE.Group(),
      offset: 0,
    }
    const noMatchState: GameState = {
      ...testState,
      passengerQueue: [{ color: 'blue', id: 'blue-loop' }],
    }
    const gateCycles = new Map([['blue-loop', -1]])
    const gateHolds = new Map<string, PassengerGateHold>()
    const onPassengerGate = jest.fn()

    notifyPassengerGate([bluePassenger], 0, gateCycles, noMatchState, [], 20, onPassengerGate, gateHolds)

    expect(onPassengerGate).not.toHaveBeenCalled()
    expect(gateCycles.get('blue-loop')).toBe(0)
    expect(gateHolds.size).toBe(0)
  })

  it('uses logical offsets for gate boarding even when passengers have visual lane offsets', () => {
    const passenger: PassengerRenderItem = {
      id: 'p1',
      laneOffset: 0.16,
      layout: testLayout,
      mesh: new THREE.Group(),
      offset: 0,
    }
    const onPassengerGate = jest.fn()

    notifyPassengerGate([passenger], 0, new Map([['p1', -1]]), testState, [], 20, onPassengerGate)

    expect(onPassengerGate).toHaveBeenCalledWith('p1')
  })

  it('times the feeder walk-in to complete as the empty slot reaches the join', () => {
    // The animation must finish at the join time so the passenger merges into the
    // gap as it arrives, instead of starting there and chasing a slot that has
    // already moved several positions along the loop (which crosses other passengers).
    const joinAt = 10
    const entry = createPassengerEntryAnimation(
      { color: 'red', feederSide: 'left', id: 'p1' },
      [{ color: 'red', feederSide: 'left', id: 'p1' }],
      testLayout,
      new THREE.Vector3(0, 0.1, 0),
      joinAt,
    )

    expect(entry.startedAt + entry.duration).toBeCloseTo(joinAt)
    expect(entry.startedAt).toBeLessThan(joinAt)
  })

  it('rejects ineligible passenger ids via canBoardPassengerAtParkingGate', () => {
    const queueState: GameState = {
      ...testState,
      passengerQueue: [
        { color: 'red', id: 'loop-red' },
        { color: 'red', id: 'feeder-red' },
      ],
    }
    const eligible = new Set(['loop-red'])

    expect(canBoardPassengerAtParkingGate(queueState, 'loop-red', new Set(), eligible)).toBe(true)
    expect(canBoardPassengerAtParkingGate(queueState, 'feeder-red', new Set(), eligible)).toBe(false)
    // Without the eligibility set, the engine still treats the feeder id as boardable.
    expect(canBoardPassengerAtParkingGate(queueState, 'feeder-red')).toBe(true)
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

const parkedCar: Car = {
  boarded: 0,
  capacity: 2,
  color: 'red',
  colorHidden: false,
  direction: 'right',
  id: 'car-1',
  length: 2,
  parkingSlotId: 'slot-1',
  position: { x: 0, y: 0 },
  sequence: 0,
  status: 'parked',
  tunnelId: null,
}

const parkingSlot: ParkingSlot = {
  id: 'slot-1',
  index: 0,
  kind: 'regular',
  occupiedCarId: 'car-1',
  unlocked: true,
}

const parkedGreenCar: Car = {
  boarded: 0,
  capacity: 2,
  color: 'green',
  colorHidden: false,
  direction: 'right',
  id: 'car-2',
  length: 2,
  parkingSlotId: 'slot-2',
  position: { x: 0, y: 0 },
  sequence: 1,
  status: 'parked',
  tunnelId: null,
}

const greenParkingSlot: ParkingSlot = {
  id: 'slot-2',
  index: 1,
  kind: 'regular',
  occupiedCarId: 'car-2',
  unlocked: true,
}

const testState: GameState = {
  boardHeight: 3,
  boardWidth: 5,
  cars: [parkedCar],
  completedLevel: null,
  failedLevel: null,
  highScore: 0,
  lastMessage: '',
  level: 1,
  levelScore: 1000,
  maxRegularSlotsUnlocked: 4,
  maxRegularSlotsUsed: 0,
  moves: 0,
  parkingSlots: [parkingSlot],
  passengerQueue: [{ color: 'red', id: 'p1' }],
  powerUps: { fill: 0, shuffle: 0, vip: 0 },
  seed: 1,
  totalScore: 0,
  tunnels: [],
  version: 2,
}

function parkingMovement(): MovingCarRenderItem {
  return {
    carId: 'car-1',
    duration: 1,
    mesh: new THREE.Group(),
    movementKind: 'parking',
    route: [],
    segmentLengths: [],
    startedAt: 10,
    totalLength: 0,
  }
}
