import { type ReactElement, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

import {
  CAR_COLORS,
  CAR_PATTERNS,
  type GameState,
  loopPassengerCapacity,
  type Passenger,
} from './gameEngine'
import { startBlockedCarAnimation } from './scene/animation/blockedCar'
import { animateBoardingPassengers, startBoardingPassengerAnimations } from './scene/animation/boardingPassengers'
import { startDepartingCarAnimations } from './scene/animation/departingCar'
import { animateMovingCars, retainPersistentMovingCars as retainPersistentMovingCarsImpl } from './scene/animation/movingCars'
import {
  animatePassengers,
  createPassengerEntryAnimation,
  notifyPassengerGate,
  type PassengerGateHold,
  setPassengerRenderHandleTransform,
} from './scene/animation/passengers'
import { createCarMesh } from './scene/builders/carMesh'
import { createField } from './scene/builders/field'
import { createGarage } from './scene/builders/garage'
import { createGround } from './scene/builders/ground'
import { createParkingRow } from './scene/builders/parkingRow'
import {
  createPassengerInstanceHandle,
  createPassengerInstancePools,
  passengerInstancePoolMeshes,
} from './scene/builders/passengerMesh'
import { createQueueTrack } from './scene/builders/queueTrack'
import {
  PASSENGER_LOOP_ENTRY_RETENTION_SECONDS,
  type PassengerLoopSlot,
  planPassengerLoopSlots,
} from './scene/passengerLoopSlots'
import { fitCameraToGameplayBounds, gameplayBoundsForState } from './scene/sceneCamera'
import {
  CAR_MOVE_SECONDS_PER_UNIT,
  MIN_CAR_MOVE_DURATION,
  PASSENGER_SPEED,
} from './scene/sceneConstants'
import {
  createParkingRoute,
  departureExitXForViewport,
  feederPassengerPosition,
  fieldPositionForCar,
  parkingSlotPosition,
  passengerGateCycle,
  passengerQueueLaneOffset,
  passengerSpacing,
  queueLayoutForState,
  queueVisualPosition,
  routeSegmentLengths,
} from './scene/sceneGeometry'
import type {
  BoardingPassengerRenderItem,
  MovingCarRenderItem,
  PassengerRenderItem,
} from './scene/sceneTypes'
import { clearGroup, disposeObject, findCarId } from './scene/threeUtils'
import {
  markParkingPickupVisualReady,
  type ParkingPickupVisualTestOptions,
  resetParkingPickupVisualReadiness,
} from './visualTestMode'

export { retainPersistentMovingCarsImpl as retainPersistentMovingCars }

export function selectFeederPassengersForRendering(feederPassengers: Passenger[]): Passenger[] {
  return feederPassengers
}

const PASSENGER_QUEUE_REFRESH_EPSILON_SECONDS = 0.03

export function passengerQueueRefreshAtForEntry(entry: NonNullable<PassengerRenderItem['entry']>): number {
  return entry.startedAt
    + Math.max(entry.duration, PASSENGER_LOOP_ENTRY_RETENTION_SECONDS)
    + PASSENGER_QUEUE_REFRESH_EPSILON_SECONDS
}

interface CarsSceneProps {
  blockedCarAttempt: { carId: string, nonce: number } | null
  colorblindMode: boolean
  state: GameState
  vipSelectionActive: boolean
  visualTestOptions?: ParkingPickupVisualTestOptions
  onCarClick: (carId: string) => void
  onPassengerGate: (passengerId: string) => void
}

const VISUAL_TEST_STABLE_FRAME_COUNT = 3

export function CarsScene({
  blockedCarAttempt,
  colorblindMode,
  state,
  vipSelectionActive,
  visualTestOptions,
  onCarClick,
  onPassengerGate,
}: CarsSceneProps): ReactElement {
  const [dynamicSceneRefreshKey, setDynamicSceneRefreshKey] = useState(0)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const contentRef = useRef<THREE.Group | null>(null)
  const staticGroupRef = useRef<THREE.Group | null>(null)
  const dynamicGroupRef = useRef<THREE.Group | null>(null)
  const staticSignatureRef = useRef<string>('')
  const effectsRef = useRef<THREE.Group | null>(null)
  const passengersRef = useRef<PassengerRenderItem[]>([])
  const gatePassengersRef = useRef<PassengerRenderItem[]>([])
  const passengerLoopSlotsRef = useRef<PassengerLoopSlot[]>([])
  const passengerOffsetsRef = useRef<Map<string, number>>(new Map())
  const passengerGateCyclesRef = useRef<Map<string, number>>(new Map())
  const passengerGateHoldsRef = useRef<Map<string, PassengerGateHold>>(new Map())
  const passengerQueueRefreshAtRef = useRef<number | null>(null)
  const feederPositionsRef = useRef<Map<string, THREE.Vector3>>(new Map())
  const loopEntriesRef = useRef<Map<string, NonNullable<PassengerRenderItem['entry']>>>(new Map())
  const boardingPassengersRef = useRef<BoardingPassengerRenderItem[]>([])
  const fieldCarMeshesRef = useRef<Map<string, THREE.Group>>(new Map())
  const movingCarsRef = useRef<MovingCarRenderItem[]>([])
  const onCarClickRef = useRef(onCarClick)
  const onPassengerGateRef = useRef(onPassengerGate)
  const visualTestOptionsRef = useRef(visualTestOptions)
  const previousStateRef = useRef<GameState | null>(null)
  const stateRef = useRef(state)
  const passengerPhaseRef = useRef(0)
  const previousBlockedAttemptRef = useRef<number | null>(null)
  const previousLevelRef = useRef<number | null>(null)
  const rendererResizeRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    onCarClickRef.current = onCarClick
  }, [onCarClick])

  useEffect(() => {
    onPassengerGateRef.current = onPassengerGate
  }, [onPassengerGate])

  useEffect(() => {
    visualTestOptionsRef.current = visualTestOptions
  }, [visualTestOptions])

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#cbd5e1')
    sceneRef.current = scene
    const passengerGateCycles = passengerGateCyclesRef.current
    const passengerGateHolds = passengerGateHoldsRef.current
    const fieldCarMeshes = fieldCarMeshesRef.current

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200)
    camera.position.set(0, 14.6, 4.2)
    camera.lookAt(0, 0, -3.6)
    cameraRef.current = camera

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.toneMapping = THREE.NeutralToneMapping
    renderer.toneMappingExposure = 1.0
    rendererRef.current = renderer
    container.appendChild(renderer.domElement)

    const pmrem = new THREE.PMREMGenerator(renderer)
    const environmentTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = environmentTexture
    scene.environmentIntensity = 0.35
    pmrem.dispose()

    const ambient = new THREE.HemisphereLight('#ffffff', '#7c8a9a', 1.9)
    scene.add(ambient)

    const sun = new THREE.DirectionalLight('#ffffff', 2.4)
    sun.position.set(-5, 10, 5)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    scene.add(sun)

    const rim = new THREE.DirectionalLight('#dbeafe', 0.6)
    rim.position.set(5, 6, -4)
    scene.add(rim)

    const content = new THREE.Group()
    scene.add(content)
    contentRef.current = content

    const staticGroup = new THREE.Group()
    content.add(staticGroup)
    staticGroupRef.current = staticGroup

    const dynamicGroup = new THREE.Group()
    content.add(dynamicGroup)
    dynamicGroupRef.current = dynamicGroup

    const effects = new THREE.Group()
    scene.add(effects)
    effectsRef.current = effects

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()

    const handlePointerDown = (event: PointerEvent): void => {
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)

      const hits = raycaster.intersectObjects(content.children, true)
      for (const hit of hits) {
        const carId = findCarId(hit.object)
        if (carId) {
          onCarClickRef.current(carId)
          return
        }
      }
    }

    renderer.domElement.addEventListener('pointerdown', handlePointerDown)

    const resize = (): void => {
      const width = Math.max(320, container.clientWidth)
      const height = Math.max(480, container.clientHeight)
      renderer.setSize(width, height)
      fitCameraToGameplayBounds({
        camera,
        width,
        height,
        bounds: gameplayBoundsForState(stateRef.current, movingCarsRef.current),
      })
    }

    rendererResizeRef.current = resize
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(container)
    resize()

    const visualTestEnabled = visualTestOptionsRef.current?.enabled === true
    if (visualTestEnabled) {
      resetParkingPickupVisualReadiness()
    }

    let frameId = 0
    let renderedFrameCount = 0
    let visualReadyMarked = false
    const visualTestLevel = stateRef.current.level
    const visualTestSeed = visualTestOptionsRef.current?.seed ?? null
    const clock = new THREE.Clock()
    const animate = (): void => {
      const delta = clock.getDelta()
      const elapsed = clock.elapsedTime
      const now = performance.now() / 1000
      passengerPhaseRef.current += delta * PASSENGER_SPEED
      animatePassengers(passengersRef.current, passengerPhaseRef.current, elapsed)
      animateBoardingPassengers(boardingPassengersRef.current, now)
      animateMovingCars(movingCarsRef.current, now)
      notifyPassengerGate(
        gatePassengersRef.current,
        passengerPhaseRef.current,
        passengerGateCyclesRef.current,
        stateRef.current,
        movingCarsRef.current,
        now,
        onPassengerGateRef.current,
        passengerGateHoldsRef.current,
      )
      if (passengerQueueRefreshAtRef.current !== null && now > passengerQueueRefreshAtRef.current) {
        passengerQueueRefreshAtRef.current = null
        setDynamicSceneRefreshKey((current) => current + 1)
      }
      renderer.render(scene, camera)
      renderedFrameCount += 1
      if (visualTestEnabled && !visualReadyMarked && renderedFrameCount >= VISUAL_TEST_STABLE_FRAME_COUNT) {
        visualReadyMarked = true
        markParkingPickupVisualReady({
          frameCount: renderedFrameCount,
          level: visualTestLevel,
          renderedAt: performance.now(),
          seed: visualTestSeed,
        })
      }

      if (visualTestEnabled && visualReadyMarked) {
        return
      }

      frameId = window.requestAnimationFrame(animate)
    }
    animate()

    return () => {
      window.cancelAnimationFrame(frameId)
      resizeObserver.disconnect()
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown)
      clearGroup(content)
      clearGroup(effects)
      renderer.dispose()
      renderer.domElement.remove()
      sceneRef.current = null
      cameraRef.current = null
      rendererRef.current = null
      contentRef.current = null
      staticGroupRef.current = null
      dynamicGroupRef.current = null
      staticSignatureRef.current = ''
      effectsRef.current = null
      passengersRef.current = []
      gatePassengersRef.current = []
      passengerLoopSlotsRef.current = []
      boardingPassengersRef.current = []
      passengerGateHolds.clear()
      passengerQueueRefreshAtRef.current = null
      fieldCarMeshes.clear()
      passengerGateCycles.clear()
      movingCarsRef.current = []
      rendererResizeRef.current = null
    }
  }, [])

  useEffect(() => {
    const staticGroup = staticGroupRef.current
    const dynamicGroup = dynamicGroupRef.current
    if (!staticGroup || !dynamicGroup) {
      return
    }

    if (previousLevelRef.current !== state.level) {
      passengerOffsetsRef.current.clear()
      passengerLoopSlotsRef.current = []
      passengerGateCyclesRef.current.clear()
      passengerGateHoldsRef.current.clear()
      passengerQueueRefreshAtRef.current = null
      feederPositionsRef.current.clear()
      loopEntriesRef.current.clear()
      boardingPassengersRef.current = []
      if (effectsRef.current) {
        clearGroup(effectsRef.current)
      }
      passengerPhaseRef.current = 0
      previousLevelRef.current = state.level
    }

    const effects = effectsRef.current
    movingCarsRef.current = retainSceneMovingCars(movingCarsRef.current, dynamicGroup, effects)

    if (previousStateRef.current?.level === state.level && effects) {
      const departureDelays = startBoardingPassengerAnimations(
        previousStateRef.current,
        state,
        passengerOffsetsRef.current,
        passengerPhaseRef.current,
        effects,
        boardingPassengersRef.current,
        colorblindMode,
      )
      startDepartingCarAnimations(
        previousStateRef.current,
        state,
        effects,
        movingCarsRef.current,
        departureDelays,
        colorblindMode,
        departureExitXForViewport(cameraRef.current),
      )
    }

    const nextSignature = staticSceneSignature(state)
    const previousStaticSignature = staticSignatureRef.current
    if (nextSignature !== previousStaticSignature) {
      clearGroup(staticGroup)
      buildStaticScene(staticGroup, state)
      staticSignatureRef.current = nextSignature
    }

    const retainedMeshes = new Set<THREE.Object3D>()
    const retainedFieldCarMeshes = new Map<string, THREE.Group>()
    for (const moving of movingCarsRef.current) {
      if (moving.movementKind === 'parking' && moving.mesh.parent === dynamicGroup) {
        retainedMeshes.add(moving.mesh)
      }
      if (moving.movementKind === 'blocked' && moving.carId && moving.mesh.parent === dynamicGroup) {
        retainedMeshes.add(moving.mesh)
        retainedFieldCarMeshes.set(moving.carId, moving.mesh as THREE.Group)
      }
      if (moving.movementKind === 'blocked-cause' && moving.carId && moving.mesh.parent === dynamicGroup) {
        retainedMeshes.add(moving.mesh)
        retainedFieldCarMeshes.set(moving.carId, moving.mesh as THREE.Group)
      }
    }

    const dynamicChildren = [...dynamicGroup.children]
    for (const child of dynamicChildren) {
      if (!retainedMeshes.has(child)) {
        dynamicGroup.remove(child)
        disposeObject(child)
      }
    }

    passengersRef.current = []
    gatePassengersRef.current = []
    fieldCarMeshesRef.current.clear()
    for (const [id, mesh] of retainedFieldCarMeshes) {
      fieldCarMeshesRef.current.set(id, mesh)
    }
    passengerQueueRefreshAtRef.current = buildDynamicScene(
      dynamicGroup,
      state,
      previousStateRef.current,
      passengersRef.current,
      gatePassengersRef.current,
      passengerLoopSlotsRef.current,
      passengerOffsetsRef.current,
      passengerGateCyclesRef.current,
      fieldCarMeshesRef.current,
      passengerPhaseRef.current,
      movingCarsRef.current,
      colorblindMode,
      feederPositionsRef.current,
      loopEntriesRef.current,
    )
    if (blockedCarAttempt && previousBlockedAttemptRef.current !== blockedCarAttempt.nonce) {
      const car = state.cars.find((candidate) => candidate.id === blockedCarAttempt.carId)
      const mesh = fieldCarMeshesRef.current.get(blockedCarAttempt.carId)
      if (car && mesh && effects) {
        startBlockedCarAnimation(car, state, mesh, movingCarsRef.current, effects)
      }
      previousBlockedAttemptRef.current = blockedCarAttempt.nonce
    }
    if (nextSignature !== previousStaticSignature) {
      rendererResizeRef.current?.()
    }
    previousStateRef.current = state
  }, [blockedCarAttempt, colorblindMode, dynamicSceneRefreshKey, state])

  return (
    <div
      ref={containerRef}
      className="h-full min-h-0 w-full overflow-hidden rounded-2xl border border-white/70 bg-slate-200 shadow-2xl shadow-slate-950/15 sm:min-h-[560px] dark:border-white/10 dark:bg-slate-900 dark:shadow-slate-950/35"
      data-vip-selection={vipSelectionActive}
    />
  )
}

export function retainSceneMovingCars(
  cars: MovingCarRenderItem[],
  dynamicGroup: THREE.Group,
  effects: THREE.Group | null,
): MovingCarRenderItem[] {
  return cars.filter((car) => {
    if (car.removeOnComplete) {
      return Boolean(effects && car.mesh.parent === effects)
    }

    return car.mesh.parent === dynamicGroup
  })
}

function staticSceneSignature(state: GameState): string {
  const layout = queueLayoutForState(state)
  const slotKey = state.parkingSlots.map((slot) => `${slot.kind}:${slot.unlocked ? 1 : 0}`).join(',')

  return [
    state.level,
    state.boardWidth,
    state.boardHeight,
    layout.straightLength.toFixed(3),
    layout.capRadius.toFixed(3),
    slotKey,
  ].join('|')
}

function buildStaticScene(content: THREE.Group, state: GameState): void {
  content.add(createGround())
  content.add(createQueueTrack(state))
  content.add(createParkingRow(state))
  content.add(createField(state))
}

function buildDynamicScene(
  content: THREE.Group,
  state: GameState,
  previousState: GameState | null,
  passengers: PassengerRenderItem[],
  gatePassengers: PassengerRenderItem[],
  passengerLoopSlots: PassengerLoopSlot[],
  passengerOffsets: Map<string, number>,
  passengerGateCycles: Map<string, number>,
  fieldCarMeshes: Map<string, THREE.Group>,
  passengerPhase: number,
  movingCars: MovingCarRenderItem[],
  colorblindMode: boolean,
  feederPositions: Map<string, THREE.Vector3>,
  loopEntries: Map<string, NonNullable<PassengerRenderItem['entry']>>,
): number | null {
  const activeParkingCarIds = new Set(
    movingCars
      .filter((car) => car.movementKind === 'parking' && car.carId)
      .map((car) => car.carId as string),
  )
  const activeBlockedCarIds = new Set(
    movingCars
      .filter((car) => car.movementKind === 'blocked' && car.carId)
      .map((car) => car.carId as string),
  )

  for (const tunnel of state.tunnels) {
    if (tunnel.remaining > 0) {
      content.add(createGarage(tunnel.garagePosition.x, tunnel.garagePosition.y, tunnel.direction, tunnel.remaining))
    }
  }

  for (const slot of state.parkingSlots) {
    const car = slot.occupiedCarId ? state.cars.find((candidate) => candidate.id === slot.occupiedCarId) : null
    if (!car || activeParkingCarIds.has(car.id)) {
      continue
    }

    const target = parkingSlotPosition(slot.index, slot.kind)
    const mesh = createCarMesh(car, target, true, { colorblindMode })
    const previousCar = previousState?.cars.find((candidate) => candidate.id === car.id)
    if (previousCar?.status === 'field') {
      const route = createParkingRoute(previousCar, target)
      const segmentLengths = routeSegmentLengths(route)
      const totalLength = segmentLengths.reduce((total, length) => total + length, 0)
      const firstPoint = route[0]
      if (firstPoint) {
        mesh.position.copy(firstPoint.position)
        mesh.rotation.y = firstPoint.rotationY
      }
      movingCars.push({
        carId: previousCar.id,
        movementKind: 'parking',
        mesh,
        route,
        segmentLengths,
        totalLength,
        startedAt: performance.now() / 1000,
        duration: Math.max(MIN_CAR_MOVE_DURATION, totalLength * CAR_MOVE_SECONDS_PER_UNIT),
      })
    }
    content.add(mesh)
  }

  for (const car of state.cars) {
    if (car.status === 'field' && !activeBlockedCarIds.has(car.id) && !fieldCarMeshes.has(car.id)) {
      const mesh = createCarMesh(car, fieldPositionForCar(car), false, { colorblindMode })
      fieldCarMeshes.set(car.id, mesh)
      content.add(mesh)
    }
  }

  const queueLayout = queueLayoutForState(state)
  const passengerPools = createPassengerInstancePools(state.passengerQueue.length, { colorblindMode })
  for (const poolMesh of passengerInstancePoolMeshes(passengerPools)) {
    content.add(poolMesh)
  }
  const spacing = passengerSpacing()
  const now = performance.now() / 1000
  let nextPassengerQueueRefreshAt: number | null = null
  const loopPlan = planPassengerLoopSlots({
    capacity: loopPassengerCapacity(state),
    layout: queueLayout,
    now,
    passengers: state.passengerQueue,
    phase: passengerPhase,
    slots: passengerLoopSlots,
    spacing,
    speed: PASSENGER_SPEED,
  })
  passengerLoopSlots.splice(0, passengerLoopSlots.length, ...loopPlan.slots)
  const currentPassengerIds = new Set(state.passengerQueue.map((passenger) => passenger.id))
  for (const id of passengerOffsets.keys()) {
    if (!currentPassengerIds.has(id)) {
      passengerOffsets.delete(id)
      passengerGateCycles.delete(id)
    }
  }
  for (const id of loopEntries.keys()) {
    if (!currentPassengerIds.has(id)) {
      loopEntries.delete(id)
    }
  }

  for (const assignment of loopPlan.assignments) {
    const { entryStartedAt, offset, passenger, sourcePassengers } = assignment
    const laneOffset = passengerQueueLaneOffset(passenger.id)
    passengerOffsets.set(passenger.id, offset)
    if (!passengerGateCycles.has(passenger.id) || entryStartedAt !== null) {
      passengerGateCycles.set(passenger.id, passengerGateCycle(passengerPhase, offset, queueLayout))
    }
    // Loop passengers keep their slot (and offset) for life — boarding never re-indexes
    // them — so a passenger's `phase + offset` advances continuously. Its gate cycle is
    // therefore continuous and must NOT be reseeded; the crossing fires naturally as it
    // rolls up to the gate.

    const handle = createPassengerInstanceHandle(passengerPools, CAR_COLORS[passenger.color].hex, {
      colorblindMode,
      pattern: CAR_PATTERNS[passenger.color],
    })
    const position = queueVisualPosition(passengerPhase + offset, queueLayout, laneOffset)
    let entry: PassengerRenderItem['entry'] | null = null
    if (entryStartedAt !== null && sourcePassengers) {
      // `entryStartedAt` is when the empty slot reaches the feeder join — the moment
      // the walk-in should *finish*. Schedule the rebuild that releases the feeder
      // layout slot after the join plus the retention window.
      nextPassengerQueueRefreshAt = earlierRefreshAt(
        nextPassengerQueueRefreshAt,
        entryStartedAt + PASSENGER_LOOP_ENTRY_RETENTION_SECONDS + PASSENGER_QUEUE_REFRESH_EPSILON_SECONDS,
      )
      if (now < entryStartedAt) {
        // Reuse the in-flight entry across rebuilds (keyed by the same join time) so
        // a mid-walk rebuild never snaps the passenger back to the feeder; only its
        // live loop target moves.
        const existing = loopEntries.get(passenger.id)
        // Use the shared feeder layout (which lists every pending-entry passenger plus
        // the unassigned feeder) as the walk-in origin, so each pending passenger maps
        // to its own distinct feeder row. Per-passenger snapshots collapsed every
        // same-side pending entry to row 0, stacking them into a z-fight once the
        // single-file lanes removed the side-to-side jitter that used to mask it.
        entry = existing && Math.abs(existing.startedAt + existing.duration - entryStartedAt) < 1e-3
          ? existing
          : createPassengerEntryAnimation(passenger, loopPlan.feederLayoutPassengers, queueLayout, position, entryStartedAt)
        loopEntries.set(passenger.id, entry)
      } else {
        loopEntries.delete(passenger.id)
      }
    } else {
      // No shift animation: the phase pull-back keeps `phase + offset` invariant for
      // every remaining passenger, so a re-indexed passenger is already at its correct
      // world position and stays put. The gap simply opens at the gate and closes as
      // the loop rotates the next passenger up to it.
      loopEntries.delete(passenger.id)
    }
    if (entry) {
      setPassengerRenderHandleTransform(handle, entry.from, 0)
    } else {
      setPassengerRenderHandleTransform(handle, new THREE.Vector3(position.x, 0.12, position.z), 0)
    }
    const passengerRenderItem: PassengerRenderItem = {
      id: passenger.id,
      mesh: handle,
      offset,
      laneOffset,
      layout: queueLayout,
    }
    if (entry) {
      passengerRenderItem.entry = entry
    }
    passengers.push(passengerRenderItem)
    gatePassengers.push(passengerRenderItem)
  }

  const feederPassengers = selectFeederPassengersForRendering(loopPlan.feederPassengers)
  const feederLayoutPassengers = selectFeederPassengersForRendering(loopPlan.feederLayoutPassengers)
  const feederIds = new Set(feederPassengers.map((passenger) => passenger.id))
  for (const id of feederPositions.keys()) {
    if (!feederIds.has(id)) {
      feederPositions.delete(id)
    }
  }
  for (const passenger of feederPassengers) {
    const handle = createPassengerInstanceHandle(passengerPools, CAR_COLORS[passenger.color].hex, {
      colorblindMode,
      pattern: CAR_PATTERNS[passenger.color],
    })
    const target = feederPassengerPosition(passenger, feederLayoutPassengers, queueLayout)
    target.y = 0.1
    const previous = feederPositions.get(passenger.id)
    const fixedTarget = target.clone()
    const item: PassengerRenderItem = {
      id: passenger.id,
      mesh: handle,
      offset: 0,
      layout: queueLayout,
      fixedTarget,
    }
    if (previous && previous.distanceTo(target) > 0.01) {
      item.entry = {
        from: previous.clone(),
        startedAt: now,
        duration: 0.55,
      }
      setPassengerRenderHandleTransform(handle, previous, 0)
    } else {
      setPassengerRenderHandleTransform(handle, target, 0)
    }
    feederPositions.set(passenger.id, target.clone())
    passengers.push(item)
  }

  return nextPassengerQueueRefreshAt
}

function earlierRefreshAt(current: number | null, candidate: number): number {
  return current === null ? candidate : Math.min(current, candidate)
}

