import { type ReactElement, useEffect, useRef } from 'react'
import * as THREE from 'three'

import {
  type GameState,
  isBoxDisplayedAsHidden,
  type MarbleBox,
  type MarbleColor,
  SORTING_BLOCK_CAPACITY,
  type SortingStack,
} from './gameEngine'
import {
  type ConfettiBurst,
  createConfettiBurst,
  disposeConfettiBurst,
  updateConfettiBurst,
} from './scene/animation/confetti'
import { animateConveyorBeltMarkers } from './scene/animation/conveyor'
import {
  createSlotDropTween,
  type SlotDropTween,
  updateSlotDropTween,
} from './scene/animation/slotDrop'
import {
  createStackRiseTween,
  type StackRiseTween,
  updateStackRiseTween,
} from './scene/animation/sortingStack'
import { shouldReportArrival } from './scene/arrivalGate'
import { createBoxMesh } from './scene/builders/boxMesh'
import { createChuteMesh } from './scene/builders/chuteMesh'
import { createConveyorBeltMarkers, createConveyorTrack } from './scene/builders/conveyorTrack'
import { createMarbleMesh } from './scene/builders/marbleMesh'
import { createPlayfield } from './scene/builders/playfield'
import { createSortingStackMesh } from './scene/builders/sortingBlockMesh'
import {
  CONVEYOR_PROGRESS_SPEED,
  conveyorPhaseForTick,
  conveyorProgressSpeedForSlotCount,
  conveyorSlotCountFor,
  conveyorSlotProgress,
  easeConveyorOffset,
  preserveConveyorOffsetsForOrderChange,
} from './scene/conveyorProgress'
import {
  createMarbleBodyManager,
  type MarbleBodyManager,
} from './scene/physics/marbleBodies'
import {
  createPhysicsWorld,
  disposePhysicsWorld,
  type PhysicsWorld,
  stepPhysics,
} from './scene/physics/world'
import { SCENE_BACKGROUND } from './scene/sceneConstants'
import { conveyorPositionAt } from './scene/sceneGeometry'
import type { BeltMarkerRenderItem } from './scene/sceneTypes'
import { clearGroup, disposeObject, findBoxId } from './scene/threeUtils'

interface MarbleSortSceneProps {
  colorblindMode: boolean
  state: GameState
  onBoxClick: (boxId: string) => void
  onMarbleArrived: (marbleId: string) => void
}

type MarblePhase = 'falling' | 'transit' | 'conveyor' | 'slotDrop'

interface MarbleEntry {
  mesh: THREE.Group
  phase: MarblePhase
  color: MarbleColor
}

interface TransitData {
  startedAt: number
  duration: number
  from: THREE.Vector3
}

const TRANSIT_DURATION = 0.22

export function MarbleSortScene({
  colorblindMode,
  state,
  onBoxClick,
  onMarbleArrived,
}: MarbleSortSceneProps): ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const staticGroupRef = useRef<THREE.Group | null>(null)
  const dynamicGroupRef = useRef<THREE.Group | null>(null)
  const marbleGroupRef = useRef<THREE.Group | null>(null)
  const effectGroupRef = useRef<THREE.Group | null>(null)
  const beltMarkersRef = useRef<BeltMarkerRenderItem[]>([])
  const physicsRef = useRef<PhysicsWorld | null>(null)
  const bodiesRef = useRef<MarbleBodyManager | null>(null)
  const marbleEntriesRef = useRef<Map<string, MarbleEntry>>(new Map())
  const transitRef = useRef<Map<string, TransitData>>(new Map())
  const conveyorOffsetsRef = useRef<Map<string, number>>(new Map())
  const conveyorOrderRef = useRef<string[]>([])
  const conveyorSlotCountRef = useRef(1)
  const onBoxClickRef = useRef(onBoxClick)
  const onMarbleArrivedRef = useRef(onMarbleArrived)
  const arrivedAttemptsRef = useRef<Map<string, number>>(new Map())
  const fallingIdsRef = useRef<Set<string>>(new Set())
  const stateRef = useRef(state)
  const previousStateRef = useRef<GameState | null>(null)
  const previousColorblindModeRef = useRef(colorblindMode)
  const conveyorPhaseRef = useRef(0)
  const beltMarkerPhaseRef = useRef(0)
  const confettiBurstsRef = useRef<ConfettiBurst[]>([])
  const stackTweensRef = useRef<StackRiseTween[]>([])
  const stackGroupsRef = useRef<Map<string, THREE.Group>>(new Map())
  const slotDropTweensRef = useRef<Map<string, SlotDropTween>>(new Map())

  const syncMarbles = (
    nextState: GameState,
    previousState: GameState | null,
    marbleGroup: THREE.Group,
    bodies: MarbleBodyManager,
  ): void => {
    const entries = marbleEntriesRef.current
    const fallingIds = new Set(nextState.fallingMarbles.map((marble) => marble.id))
    fallingIdsRef.current = fallingIds
    const conveyorIds = new Set(nextState.conveyor.map((marble) => marble.id))
    const conveyorOffsets = conveyorOffsetsRef.current
    const previousOrder = conveyorOrderRef.current
    const previousSlotCount = conveyorSlotCountRef.current
    const previousPhase = conveyorPhaseRef.current
    const nextOrder = nextState.conveyor.map((marble) => marble.id)
    const nextSlotCount = conveyorSlotCountFor(nextState.conveyorCapacity, nextOrder.length)
    const nextPhase = previousOrder.length > 0
      ? previousPhase
      : conveyorPhaseForTick(nextState.conveyorTicks, nextSlotCount)

    preserveConveyorOffsetsForOrderChange(
      conveyorOffsets,
      previousOrder,
      nextOrder,
      previousPhase,
      nextPhase,
      previousSlotCount,
      nextSlotCount,
    )
    conveyorPhaseRef.current = nextPhase
    conveyorOrderRef.current = nextOrder
    conveyorSlotCountRef.current = nextSlotCount

    const sortTargets = collectSortTargets(previousState, nextState)
    const now = performance.now() / 1000

    for (const [id, entry] of Array.from(entries.entries())) {
      if (entry.phase === 'slotDrop') {
        continue
      }
      if (fallingIds.has(id)) {
        continue
      }
      if (conveyorIds.has(id)) {
        if (entry.phase === 'falling') {
          const body = bodies.get(id)
          const from = body
            ? new THREE.Vector3(body.position.x, body.position.y, body.position.z)
            : entry.mesh.position.clone()
          transitRef.current.set(id, {
            startedAt: now,
            duration: TRANSIT_DURATION,
            from,
          })
          entry.phase = 'transit'
          bodies.release(id)
        }
        continue
      }
      const queue = sortTargets.get(entry.color)
      const targetStackId = queue && queue.length > 0 ? queue.shift() : undefined
      if (targetStackId) {
        const stackGroup = stackGroupsRef.current.get(targetStackId)
        if (stackGroup) {
          const targetPosition = stackGroup.position.clone().add(new THREE.Vector3(0, 0.55, 0))
          slotDropTweensRef.current.set(id, createSlotDropTween(id, entry.mesh, targetPosition, now))
          entry.phase = 'slotDrop'
          transitRef.current.delete(id)
          conveyorOffsets.delete(id)
          bodies.release(id)
          continue
        }
      }
      marbleGroup.remove(entry.mesh)
      disposeObject(entry.mesh)
      entries.delete(id)
      transitRef.current.delete(id)
      conveyorOffsets.delete(id)
      bodies.release(id)
    }

    for (const marble of nextState.fallingMarbles) {
      if (!entries.has(marble.id)) {
        const mesh = createMarbleMesh(marble.color, 0.13)
        marbleGroup.add(mesh)
        entries.set(marble.id, { mesh, phase: 'falling', color: marble.color })
      }
    }
    bodies.ensure(nextState.fallingMarbles)

    for (const marble of nextState.conveyor) {
      if (!entries.has(marble.id)) {
        const mesh = createMarbleMesh(marble.color, 0.13)
        marbleGroup.add(mesh)
        entries.set(marble.id, { mesh, phase: 'conveyor', color: marble.color })
      }
    }

    for (const id of Array.from(conveyorOffsets.keys())) {
      if (!conveyorIds.has(id)) {
        conveyorOffsets.delete(id)
      }
    }

    const attempts = arrivedAttemptsRef.current
    for (const id of Array.from(attempts.keys())) {
      if (!fallingIds.has(id)) {
        attempts.delete(id)
      }
    }
  }

  const updateMarbleMeshes = (now: number, delta: number): void => {
    const entries = marbleEntriesRef.current
    const bodies = bodiesRef.current
    const transit = transitRef.current
    const conveyorOffsets = conveyorOffsetsRef.current
    const order = conveyorOrderRef.current
    const slotCount = conveyorSlotCountRef.current

    for (const [id, offset] of conveyorOffsets) {
      const entry = entries.get(id)
      if (entry && entry.phase !== 'falling') {
        conveyorOffsets.set(id, easeConveyorOffset(offset, delta))
      }
    }

    const slotDrops = slotDropTweensRef.current
    for (const [id, tween] of Array.from(slotDrops.entries())) {
      const entry = entries.get(id)
      if (!entry) {
        slotDrops.delete(id)
        continue
      }
      const done = updateSlotDropTween(tween, now)
      if (done) {
        const marbleGroup = marbleGroupRef.current
        if (marbleGroup) {
          marbleGroup.remove(entry.mesh)
        }
        disposeObject(entry.mesh)
        entries.delete(id)
        slotDrops.delete(id)
      }
    }

    const attempts = arrivedAttemptsRef.current
    const fallingIds = fallingIdsRef.current
    for (const [id, entry] of entries) {
      if (entry.phase === 'falling') {
        bodies?.applyToMesh(id, entry.mesh)
        const body = bodies?.get(id)
        if (body && shouldReportArrival(id, body, fallingIds, attempts, now)) {
          attempts.set(id, now)
          onMarbleArrivedRef.current(id)
        }
        continue
      }

      if (entry.phase === 'slotDrop') {
        continue
      }

      if (entry.phase === 'transit') {
        const data = transit.get(id)
        const progress = conveyorProgressFor(id, order, slotCount, conveyorPhaseRef.current, conveyorOffsets)
        if (!data || progress === null) {
          entry.phase = 'conveyor'
          continue
        }
        const t = Math.min(1, Math.max(0, (now - data.startedAt) / data.duration))
        const eased = easeOutCubic(t)
        const target = conveyorPositionAt(progress)
        entry.mesh.position.set(
          data.from.x + (target.x - data.from.x) * eased,
          data.from.y + (target.y - data.from.y) * eased,
          data.from.z + (target.z - data.from.z) * eased,
        )
        entry.mesh.rotation.x += 0.04
        if (t >= 1) {
          entry.phase = 'conveyor'
          transit.delete(id)
        }
        continue
      }

      const progress = conveyorProgressFor(id, order, slotCount, conveyorPhaseRef.current, conveyorOffsets)
      if (progress === null) {
        continue
      }
      entry.mesh.position.copy(conveyorPositionAt(progress))
      entry.mesh.rotation.x += 0.08
    }
  }

  useEffect(() => {
    onBoxClickRef.current = onBoxClick
  }, [onBoxClick])

  useEffect(() => {
    onMarbleArrivedRef.current = onMarbleArrived
  }, [onMarbleArrived])

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(SCENE_BACKGROUND)
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 80)
    camera.position.set(0, 15.5, 5.4)
    camera.lookAt(0, 0, 1.6)
    cameraRef.current = camera

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap
    rendererRef.current = renderer
    container.appendChild(renderer.domElement)

    const stackGroups = stackGroupsRef.current
    const marbleEntries = marbleEntriesRef.current
    const transitEntries = transitRef.current
    const conveyorOffsets = conveyorOffsetsRef.current
    const slotDropTweens = slotDropTweensRef.current
    const arrivedAttempts = arrivedAttemptsRef.current
    const fallingIds = fallingIdsRef.current

    const ambient = new THREE.HemisphereLight('#ffffff', '#86d5a3', 2.4)
    scene.add(ambient)

    const sun = new THREE.DirectionalLight('#ffffff', 2.4)
    sun.position.set(-3, 11, 4)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    scene.add(sun)

    const rim = new THREE.DirectionalLight('#bcdfff', 0.8)
    rim.position.set(4, 6, -3)
    scene.add(rim)

    const staticGroup = new THREE.Group()
    staticGroup.add(createPlayfield())
    staticGroup.add(createConveyorTrack())
    const beltMarkers = createConveyorBeltMarkers()
    staticGroup.add(beltMarkers.group)
    beltMarkersRef.current = beltMarkers.markers
    scene.add(staticGroup)
    staticGroupRef.current = staticGroup

    const dynamicGroup = new THREE.Group()
    scene.add(dynamicGroup)
    dynamicGroupRef.current = dynamicGroup

    const marbleGroup = new THREE.Group()
    scene.add(marbleGroup)
    marbleGroupRef.current = marbleGroup

    const effectGroup = new THREE.Group()
    scene.add(effectGroup)
    effectGroupRef.current = effectGroup

    const physics = createPhysicsWorld()
    physicsRef.current = physics
    bodiesRef.current = createMarbleBodyManager(physics)

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()

    const handlePointerDown = (event: PointerEvent): void => {
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)

      const hits = raycaster.intersectObjects(dynamicGroup.children, true)
      for (const hit of hits) {
        const boxId = findBoxId(hit.object)
        if (boxId) {
          onBoxClickRef.current(boxId)
          return
        }
      }
    }

    renderer.domElement.addEventListener('pointerdown', handlePointerDown)

    const resize = (): void => {
      const width = Math.max(320, container.clientWidth)
      const height = Math.max(480, container.clientHeight)
      const narrow = width < 640
      renderer.setSize(width, height)
      camera.fov = narrow ? 48 : 42
      camera.position.set(0, narrow ? 17.0 : 15.5, narrow ? 6.0 : 5.4)
      camera.lookAt(0, 0, narrow ? 1.8 : 1.6)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }

    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(container)
    resize()

    let frameId = 0
    const timer = new THREE.Timer()
    timer.connect(document)
    const animate = (timestamp?: number): void => {
      timer.update(timestamp)
      const delta = timer.getDelta()
      const now = performance.now() / 1000
      conveyorPhaseRef.current += delta * conveyorProgressSpeedForSlotCount(conveyorSlotCountRef.current)
      beltMarkerPhaseRef.current += delta * CONVEYOR_PROGRESS_SPEED

      stepPhysics(physics.world, delta)
      animateConveyorBeltMarkers(beltMarkersRef.current, beltMarkerPhaseRef.current)
      updateMarbleMeshes(now, delta)

      confettiBurstsRef.current = confettiBurstsRef.current.filter((burst) => {
        const done = updateConfettiBurst(burst, now)
        if (done) {
          effectGroup.remove(burst.group)
          disposeConfettiBurst(burst)
        }
        return !done
      })

      stackTweensRef.current = stackTweensRef.current.filter((tween) => {
        const done = updateStackRiseTween(tween, now)
        return !done
      })

      renderer.render(scene, camera)
      frameId = window.requestAnimationFrame(animate)
    }
    animate()

    return () => {
      window.cancelAnimationFrame(frameId)
      timer.dispose()
      resizeObserver.disconnect()
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown)
      bodiesRef.current?.release_all()
      if (physicsRef.current) {
        disposePhysicsWorld(physicsRef.current)
      }
      if (staticGroupRef.current) {
        clearGroup(staticGroupRef.current)
      }
      if (dynamicGroupRef.current) {
        clearGroup(dynamicGroupRef.current)
      }
      if (marbleGroupRef.current) {
        clearGroup(marbleGroupRef.current)
      }
      if (effectGroupRef.current) {
        clearGroup(effectGroupRef.current)
      }
      renderer.dispose()
      renderer.domElement.remove()
      sceneRef.current = null
      cameraRef.current = null
      rendererRef.current = null
      staticGroupRef.current = null
      dynamicGroupRef.current = null
      marbleGroupRef.current = null
      effectGroupRef.current = null
      physicsRef.current = null
      bodiesRef.current = null
      marbleEntries.clear()
      transitEntries.clear()
      conveyorOffsets.clear()
      conveyorOrderRef.current = []
      conveyorSlotCountRef.current = 1
      beltMarkerPhaseRef.current = 0
      beltMarkersRef.current = []
      confettiBurstsRef.current = []
      stackTweensRef.current = []
      slotDropTweens.clear()
      arrivedAttempts.clear()
      fallingIds.clear()
      stackGroups.clear()
    }
  }, [])

  useEffect(() => {
    const dynamicGroup = dynamicGroupRef.current
    const marbleGroup = marbleGroupRef.current
    const effectGroup = effectGroupRef.current
    const bodies = bodiesRef.current
    if (!dynamicGroup || !marbleGroup || !effectGroup || !bodies) {
      return
    }

    const previous = previousStateRef.current
    const clearEvents = computeClearedBlockEvents(previous, state)
    const shouldRebuildDynamicObjects = (
      !previous
      || previousColorblindModeRef.current !== colorblindMode
      || dynamicObjectsSignature(previous) !== dynamicObjectsSignature(state)
    )

    if (shouldRebuildDynamicObjects) {
      clearGroup(dynamicGroup)
      stackGroupsRef.current.clear()

      for (const chute of state.chutes) {
        dynamicGroup.add(createChuteMesh(chute))
      }

      for (const box of state.boxes) {
        const displayBox: MarbleBox = {
          ...box,
          hidden: isBoxDisplayedAsHidden(box, state.boxes),
        }
        dynamicGroup.add(createBoxMesh(displayBox, colorblindMode))
      }

      for (const stack of state.sortingStacks) {
        const stackMesh = createSortingStackMesh(stack, state.sortingStacks.length, colorblindMode)
        dynamicGroup.add(stackMesh)
        stackGroupsRef.current.set(stack.id, stackMesh)
      }
    }

    syncMarbles(state, previous, marbleGroup, bodies)

    for (const event of clearEvents) {
      const stackGroup = stackGroupsRef.current.get(event.stackId)
      if (stackGroup) {
        const tween = createStackRiseTween(stackGroup)
        stackTweensRef.current.push(tween)
      }
      const stack = state.sortingStacks.find((candidate) => candidate.id === event.stackId)
      const x = stackGroup?.position.x ?? 0
      const z = stackGroup?.position.z ?? 0
      const confetti = createConfettiBurst(new THREE.Vector3(x, 0.4, z), stack?.color ?? event.color)
      effectGroup.add(confetti.group)
      confettiBurstsRef.current.push(confetti)
    }

    previousStateRef.current = state
    previousColorblindModeRef.current = colorblindMode
  }, [colorblindMode, state])

  return (
    <div
      ref={containerRef}
      className="h-full min-h-0 w-full overflow-hidden rounded-lg border border-white/70 bg-emerald-500 shadow-2xl shadow-slate-950/20 sm:min-h-[560px] dark:border-white/10 dark:bg-emerald-950 dark:shadow-slate-950/35"
    />
  )
}

function easeOutCubic(t: number): number {
  return 1 - ((1 - t) ** 3)
}

function conveyorProgressFor(
  id: string,
  order: string[],
  slotCount: number,
  phase: number,
  offsets: Map<string, number>,
): number | null {
  const index = order.indexOf(id)
  if (index < 0) {
    return null
  }

  return conveyorSlotProgress(phase, slotCount, index) + (offsets.get(id) ?? 0)
}

interface ClearEvent {
  stackId: string
  color: SortingStack['color']
}

function collectSortTargets(previous: GameState | null, next: GameState): Map<MarbleColor, string[]> {
  const targets = new Map<MarbleColor, string[]>()
  if (!previous) {
    return targets
  }
  const nextStackById = new Map(next.sortingStacks.map((stack) => [stack.id, stack]))
  for (const stack of previous.sortingStacks) {
    const prevTop = stack.blocks[0]
    if (!prevTop) {
      continue
    }
    const after = nextStackById.get(stack.id)
    const afterTop = after?.blocks[0]
    let landed = 0
    if (afterTop && afterTop.id === prevTop.id) {
      if (afterTop.slotsFilled > prevTop.slotsFilled) {
        landed = afterTop.slotsFilled - prevTop.slotsFilled
      }
    } else {
      // The previous top block was completed and shifted out; it received its remaining slots.
      landed = SORTING_BLOCK_CAPACITY - prevTop.slotsFilled
    }
    for (let i = 0; i < landed; i += 1) {
      const queue = targets.get(prevTop.color) ?? []
      queue.push(stack.id)
      targets.set(prevTop.color, queue)
    }
  }

  return targets
}

function computeClearedBlockEvents(previous: GameState | null, next: GameState): ClearEvent[] {
  if (!previous) {
    return []
  }
  const events: ClearEvent[] = []
  const previousById = new Map(previous.sortingStacks.map((stack) => [stack.id, stack]))
  for (const stack of next.sortingStacks) {
    const before = previousById.get(stack.id)
    if (!before) {
      continue
    }
    const beforeTop = before.blocks[0]
    const afterTop = stack.blocks[0]
    if (beforeTop && (!afterTop || beforeTop.id !== afterTop.id)) {
      events.push({ stackId: stack.id, color: beforeTop.color })
    }
  }
  return events
}

function dynamicObjectsSignature(state: GameState): string {
  return [
    state.boxes.map((box) => `${box.id}:${box.color}:${box.hidden ? 1 : 0}:${isBoxDisplayedAsHidden(box, state.boxes) ? 1 : 0}:${box.position.column}:${box.position.row}`).join(','),
    state.chutes.map((chute) => (
      `${chute.id}:${chute.side}:${chute.row}:${chute.remaining}:${chute.queue.map((box) => `${box.color}:${box.hidden ? 1 : 0}`).join('.')}`
    )).join(','),
    state.sortingStacks.map((stack) => (
      `${stack.id}:${stack.blocks.map((block) => `${block.id}:${block.color}:${block.slotsFilled}`).join('.')}`
    )).join(','),
  ].join('|')
}

export function disposeMarbleSortObjectForTest(object: THREE.Object3D): void {
  disposeObject(object)
}
