import { type ReactElement, useEffect, useRef } from 'react'
import * as THREE from 'three'

import { type GameState, type MarbleBox, type MarbleColor, type SortingStack } from './gameEngine'
import {
  type BoxBurst,
  createBoxBurst,
  disposeBoxBurst,
  updateBoxBurst,
} from './scene/animation/boxBurst'
import {
  type ConfettiBurst,
  createConfettiBurst,
  disposeConfettiBurst,
  updateConfettiBurst,
} from './scene/animation/confetti'
import { animateConveyorBeltMarkers } from './scene/animation/conveyor'
import {
  createStackRiseTween,
  type StackRiseTween,
  updateStackRiseTween,
} from './scene/animation/sortingStack'
import { createBoxMesh } from './scene/builders/boxMesh'
import { createChuteMesh } from './scene/builders/chuteMesh'
import { createConveyorBeltMarkers, createConveyorTrack } from './scene/builders/conveyorTrack'
import { createMarbleMesh } from './scene/builders/marbleMesh'
import { createPlayfield } from './scene/builders/playfield'
import { createSortingStackMesh } from './scene/builders/sortingBlockMesh'
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
import { conveyorSlotPosition, gridCellPosition } from './scene/sceneGeometry'
import type { BeltMarkerRenderItem } from './scene/sceneTypes'
import { clearGroup, disposeObject, findBoxId } from './scene/threeUtils'

interface MarbleSortSceneProps {
  colorblindMode: boolean
  state: GameState
  onBoxClick: (boxId: string) => void
}

type MarblePhase = 'falling' | 'transit' | 'conveyor'

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

const TRANSIT_DURATION = 0.48

export function MarbleSortScene({ colorblindMode, state, onBoxClick }: MarbleSortSceneProps): ReactElement {
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
  const conveyorOrderRef = useRef<string[]>([])
  const onBoxClickRef = useRef(onBoxClick)
  const stateRef = useRef(state)
  const previousStateRef = useRef<GameState | null>(null)
  const conveyorPhaseRef = useRef(0)
  const confettiBurstsRef = useRef<ConfettiBurst[]>([])
  const boxBurstsRef = useRef<BoxBurst[]>([])
  const stackTweensRef = useRef<StackRiseTween[]>([])
  const stackGroupsRef = useRef<Map<string, THREE.Group>>(new Map())

  const syncMarbles = (nextState: GameState, marbleGroup: THREE.Group, bodies: MarbleBodyManager): void => {
    const entries = marbleEntriesRef.current
    const fallingIds = new Set(nextState.fallingMarbles.map((marble) => marble.id))
    const conveyorIds = new Set(nextState.conveyor.map((marble) => marble.id))

    for (const [id, entry] of Array.from(entries.entries())) {
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
            startedAt: performance.now() / 1000,
            duration: TRANSIT_DURATION,
            from,
          })
          entry.phase = 'transit'
          bodies.release(id)
        }
        continue
      }
      marbleGroup.remove(entry.mesh)
      disposeObject(entry.mesh)
      entries.delete(id)
      transitRef.current.delete(id)
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

    conveyorOrderRef.current = nextState.conveyor.map((marble) => marble.id)
  }

  const updateMarbleMeshes = (now: number, phase: number): void => {
    const entries = marbleEntriesRef.current
    const bodies = bodiesRef.current
    const transit = transitRef.current
    const order = conveyorOrderRef.current
    const slotCount = Math.max(1, stateRef.current.conveyorCapacity, order.length)

    for (const [id, entry] of entries) {
      if (entry.phase === 'falling') {
        bodies?.applyToMesh(id, entry.mesh)
        continue
      }

      if (entry.phase === 'transit') {
        const data = transit.get(id)
        const index = order.indexOf(id)
        if (!data || index < 0) {
          entry.phase = 'conveyor'
          continue
        }
        const t = Math.min(1, Math.max(0, (now - data.startedAt) / data.duration))
        const eased = easeOutCubic(t)
        const target = conveyorSlotPosition(index, phase, slotCount)
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

      const index = order.indexOf(id)
      if (index < 0) {
        continue
      }
      entry.mesh.position.copy(conveyorSlotPosition(index, phase, slotCount))
      entry.mesh.rotation.x += 0.08
    }
  }

  useEffect(() => {
    onBoxClickRef.current = onBoxClick
  }, [onBoxClick])

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

    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 80)
    camera.position.set(0, 12.6, 4.0)
    camera.lookAt(0, 0, 0.6)
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
      camera.fov = narrow ? 42 : 36
      camera.position.set(0, narrow ? 14.2 : 12.6, narrow ? 4.6 : 4.0)
      camera.lookAt(0, 0, narrow ? 0.8 : 0.6)
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
      conveyorPhaseRef.current += delta * 0.06

      stepPhysics(physics.world, delta)
      animateConveyorBeltMarkers(beltMarkersRef.current, conveyorPhaseRef.current)
      updateMarbleMeshes(now, conveyorPhaseRef.current)

      confettiBurstsRef.current = confettiBurstsRef.current.filter((burst) => {
        const done = updateConfettiBurst(burst, now)
        if (done) {
          effectGroup.remove(burst.group)
          disposeConfettiBurst(burst)
        }
        return !done
      })

      boxBurstsRef.current = boxBurstsRef.current.filter((burst) => {
        const done = updateBoxBurst(burst, now)
        if (done) {
          effectGroup.remove(burst.group)
          disposeBoxBurst(burst)
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
      conveyorOrderRef.current = []
      beltMarkersRef.current = []
      confettiBurstsRef.current = []
      boxBurstsRef.current = []
      stackTweensRef.current = []
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
    const burstEvents = computeBurstEvents(previous, state)
    const clearEvents = computeClearedBlockEvents(previous, state)

    for (const event of burstEvents) {
      const burst = createBoxBurst(gridCellPosition(event.position), event.color)
      effectGroup.add(burst.group)
      boxBurstsRef.current.push(burst)
    }

    clearGroup(dynamicGroup)
    stackGroupsRef.current.clear()

    for (const chute of state.chutes) {
      dynamicGroup.add(createChuteMesh(chute))
    }

    for (const box of state.boxes) {
      dynamicGroup.add(createBoxMesh(box, colorblindMode))
    }

    for (const stack of state.sortingStacks) {
      const stackMesh = createSortingStackMesh(stack, state.sortingStacks.length, colorblindMode)
      dynamicGroup.add(stackMesh)
      stackGroupsRef.current.set(stack.id, stackMesh)
    }

    syncMarbles(state, marbleGroup, bodies)

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

interface BurstEvent {
  id: string
  color: MarbleBox['color']
  position: MarbleBox['position']
}

interface ClearEvent {
  stackId: string
  color: SortingStack['color']
}

function computeBurstEvents(previous: GameState | null, next: GameState): BurstEvent[] {
  if (!previous) {
    return []
  }
  const currentIds = new Set(next.boxes.map((box) => box.id))
  const events: BurstEvent[] = []
  for (const box of previous.boxes) {
    if (!currentIds.has(box.id)) {
      events.push({ id: box.id, color: box.color, position: box.position })
    }
  }
  return events
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

export function disposeMarbleSortObjectForTest(object: THREE.Object3D): void {
  disposeObject(object)
}
