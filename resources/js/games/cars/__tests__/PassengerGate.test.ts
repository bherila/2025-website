import * as THREE from 'three'

import type { Car, GameState, ParkingSlot } from '../gameEngine'
import { notifyPassengerGate } from '../scene/animation/passengers'
import type { PassengerRenderItem, QueueLayout } from '../scene/sceneTypes'

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

const testState: GameState = {
  boardHeight: 3,
  boardWidth: 5,
  cars: [parkedCar],
  completedLevel: null,
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
  version: 1,
}
