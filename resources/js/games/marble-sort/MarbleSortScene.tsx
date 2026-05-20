import { type ReactElement, useEffect, useRef } from 'react'
import * as THREE from 'three'

import { type GameState } from './gameEngine'
import { animateConveyorBeltMarkers, animateConveyorItems, animateFallingItems } from './scene/animation/conveyor'
import { createBoxMesh } from './scene/builders/boxMesh'
import { createChuteMesh } from './scene/builders/chuteMesh'
import { createConveyorBeltMarkers, createConveyorTrack } from './scene/builders/conveyorTrack'
import { createMarbleMesh } from './scene/builders/marbleMesh'
import { createPlayfield } from './scene/builders/playfield'
import { createSortingStackMesh } from './scene/builders/sortingBlockMesh'
import { SCENE_BACKGROUND } from './scene/sceneConstants'
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
  const conveyorItemsRef = useRef<ConveyorRenderItem[]>([])
  const beltMarkersRef = useRef<BeltMarkerRenderItem[]>([])
  const fallingItemsRef = useRef<FallingRenderItem[]>([])
  const fallingStartedAtRef = useRef<Map<string, number>>(new Map())
  const onBoxClickRef = useRef(onBoxClick)
  const stateRef = useRef(state)
  const conveyorPhaseRef = useRef(0)

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

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 80)
    camera.position.set(0, 9.3, 4.8)
    camera.lookAt(0, 0, -0.6)
    cameraRef.current = camera

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap
    rendererRef.current = renderer
    container.appendChild(renderer.domElement)

    const ambient = new THREE.HemisphereLight('#ffffff', '#5e8f72', 2.1)
    scene.add(ambient)

    const sun = new THREE.DirectionalLight('#ffffff', 2.6)
    sun.position.set(-3, 9, 4)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    scene.add(sun)

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
      camera.fov = narrow ? 50 : 42
      camera.position.set(0, narrow ? 10.8 : 9.4, narrow ? 5.65 : 4.85)
      camera.lookAt(0, 0, narrow ? -0.45 : -0.7)
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
      conveyorPhaseRef.current += delta * 0.12
      animateConveyorBeltMarkers(beltMarkersRef.current, conveyorPhaseRef.current)
      animateConveyorItems(conveyorItemsRef.current, conveyorPhaseRef.current)
      animateFallingItems(fallingItemsRef.current, performance.now() / 1000)
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
      renderer.dispose()
      renderer.domElement.remove()
      sceneRef.current = null
      cameraRef.current = null
      rendererRef.current = null
      staticGroupRef.current = null
      dynamicGroupRef.current = null
      conveyorItemsRef.current = []
      beltMarkersRef.current = []
      fallingItemsRef.current = []
      fallingStartedAt.clear()
    }
  }, [])

  useEffect(() => {
    const dynamicGroup = dynamicGroupRef.current
    if (!dynamicGroup) {
      return
    }

    clearGroup(dynamicGroup)
    conveyorItemsRef.current = []
    fallingItemsRef.current = []

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
        capacity: state.conveyorCapacity,
        id: marble.id,
        index,
        mesh,
        total: state.conveyor.length,
      })
    })

    for (const stack of state.sortingStacks) {
      dynamicGroup.add(createSortingStackMesh(stack, state.sortingStacks.length, colorblindMode))
    }
  }, [colorblindMode, state])

  return (
    <div
      ref={containerRef}
      className="h-full min-h-0 w-full overflow-hidden rounded-lg border border-white/70 bg-emerald-500 shadow-2xl shadow-slate-950/20 sm:min-h-[560px] dark:border-white/10 dark:bg-emerald-950 dark:shadow-slate-950/35"
    />
  )
}

export function disposeMarbleSortObjectForTest(object: THREE.Object3D): void {
  disposeObject(object)
}
