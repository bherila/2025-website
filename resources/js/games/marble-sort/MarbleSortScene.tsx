import { type ReactElement, useEffect, useRef } from 'react'
import * as THREE from 'three'

import { type GameState, type MarbleBox, type SortingStack } from './gameEngine'
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
import { animateConveyorBeltMarkers, animateConveyorItems, animateFallingItems } from './scene/animation/conveyor'
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
import { SCENE_BACKGROUND } from './scene/sceneConstants'
import { gridCellPosition } from './scene/sceneGeometry'
import type { BeltMarkerRenderItem, ConveyorRenderItem, FallingRenderItem } from './scene/sceneTypes'
import { clearGroup, disposeObject, findBoxId } from './scene/threeUtils'

interface MarbleSortSceneProps {
  colorblindMode: boolean
  state: GameState
  onBoxClick: (boxId: string) => void
}

export function MarbleSortScene({ colorblindMode, state, onBoxClick }: MarbleSortSceneProps): ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const staticGroupRef = useRef<THREE.Group | null>(null)
  const dynamicGroupRef = useRef<THREE.Group | null>(null)
  const effectGroupRef = useRef<THREE.Group | null>(null)
  const conveyorItemsRef = useRef<ConveyorRenderItem[]>([])
  const beltMarkersRef = useRef<BeltMarkerRenderItem[]>([])
  const fallingItemsRef = useRef<FallingRenderItem[]>([])
  const fallingStartedAtRef = useRef<Map<string, number>>(new Map())
  const onBoxClickRef = useRef(onBoxClick)
  const stateRef = useRef(state)
  const previousStateRef = useRef<GameState | null>(null)
  const conveyorPhaseRef = useRef(0)
  const confettiBurstsRef = useRef<ConfettiBurst[]>([])
  const boxBurstsRef = useRef<BoxBurst[]>([])
  const stackTweensRef = useRef<StackRiseTween[]>([])
  const stackGroupsRef = useRef<Map<string, THREE.Group>>(new Map())

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
    camera.position.set(0, 12.2, 3.5)
    camera.lookAt(0, 0, 0.2)
    cameraRef.current = camera

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    rendererRef.current = renderer
    container.appendChild(renderer.domElement)

    const stackGroups = stackGroupsRef.current

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
    const fallingStartedAt = fallingStartedAtRef.current

    const effectGroup = new THREE.Group()
    scene.add(effectGroup)
    effectGroupRef.current = effectGroup

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
      camera.position.set(0, narrow ? 13.8 : 12.2, narrow ? 4.2 : 3.5)
      camera.lookAt(0, 0, narrow ? 0.4 : 0.2)
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
      conveyorPhaseRef.current += delta * 0.07
      animateConveyorBeltMarkers(beltMarkersRef.current, conveyorPhaseRef.current)
      animateConveyorItems(conveyorItemsRef.current, conveyorPhaseRef.current)
      animateFallingItems(fallingItemsRef.current, now)

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
      if (staticGroupRef.current) {
        clearGroup(staticGroupRef.current)
      }
      if (dynamicGroupRef.current) {
        clearGroup(dynamicGroupRef.current)
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
      effectGroupRef.current = null
      conveyorItemsRef.current = []
      beltMarkersRef.current = []
      fallingItemsRef.current = []
      confettiBurstsRef.current = []
      boxBurstsRef.current = []
      stackTweensRef.current = []
      stackGroups.clear()
      fallingStartedAt.clear()
    }
  }, [])

  useEffect(() => {
    const dynamicGroup = dynamicGroupRef.current
    const effectGroup = effectGroupRef.current
    if (!dynamicGroup || !effectGroup) {
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
    conveyorItemsRef.current = []
    fallingItemsRef.current = []
    stackGroupsRef.current.clear()

    const now = performance.now() / 1000
    const currentFallingIds = new Set(state.fallingMarbles.map((marble) => marble.id))
    for (const id of fallingStartedAtRef.current.keys()) {
      if (!currentFallingIds.has(id)) {
        fallingStartedAtRef.current.delete(id)
      }
    }

    for (const chute of state.chutes) {
      dynamicGroup.add(createChuteMesh(chute))
    }

    for (const box of state.boxes) {
      dynamicGroup.add(createBoxMesh(box, colorblindMode))
    }

    state.fallingMarbles.forEach((marble, index) => {
      if (!fallingStartedAtRef.current.has(marble.id)) {
        fallingStartedAtRef.current.set(marble.id, now)
      }
      const mesh = createMarbleMesh(marble.color, 0.12)
      dynamicGroup.add(mesh)
      fallingItemsRef.current.push({
        from: marble.from,
        id: marble.id,
        mesh,
        startedAt: fallingStartedAtRef.current.get(marble.id) ?? now,
      })
      mesh.position.y += index * 0.01
    })

    state.conveyor.forEach((marble, index) => {
      const mesh = createMarbleMesh(marble.color, 0.13)
      dynamicGroup.add(mesh)
      conveyorItemsRef.current.push({
        id: marble.id,
        index,
        mesh,
      })
    })

    for (const stack of state.sortingStacks) {
      const stackMesh = createSortingStackMesh(stack, state.sortingStacks.length, colorblindMode)
      dynamicGroup.add(stackMesh)
      stackGroupsRef.current.set(stack.id, stackMesh)
    }

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
