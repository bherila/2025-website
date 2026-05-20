import * as THREE from 'three'

import {
  CONVEYOR_CENTER_Z,
  CONVEYOR_HEIGHT,
  CONVEYOR_WIDTH,
} from '../sceneConstants'
import { conveyorPositionAt } from '../sceneGeometry'
import { type BeltMarkerRenderItem } from '../sceneTypes'
import { createCanvasPlane, roundRect } from '../threeUtils'

export function createConveyorTrack(): THREE.Group {
  const group = new THREE.Group()

  const housing = createCanvasPlane(CONVEYOR_WIDTH + 0.6, CONVEYOR_HEIGHT + 0.5, (context, width, height) => {
    context.clearRect(0, 0, width, height)
    roundRect(context, 2, 2, width - 4, height - 4, (height - 4) / 2)
    const gradient = context.createLinearGradient(0, 0, 0, height)
    gradient.addColorStop(0, '#f9fbfd')
    gradient.addColorStop(1, '#dde6f1')
    context.fillStyle = gradient
    context.fill()
    context.lineWidth = 12
    context.strokeStyle = '#b9c4d4'
    context.stroke()
  })
  housing.position.z = CONVEYOR_CENTER_Z
  housing.position.y = -0.01
  group.add(housing)

  const belt = createCanvasPlane(CONVEYOR_WIDTH, CONVEYOR_HEIGHT, (context, width, height) => {
    context.clearRect(0, 0, width, height)
    roundRect(context, 4, 4, width - 8, height - 8, height / 2 - 4)
    context.fillStyle = '#9ea7b8'
    context.fill()

    roundRect(context, 38, 36, width - 76, height - 72, height / 2 - 36)
    const gradient = context.createLinearGradient(0, 0, 0, height)
    gradient.addColorStop(0, '#7d869a')
    gradient.addColorStop(0.5, '#6a7287')
    gradient.addColorStop(1, '#838ca0')
    context.fillStyle = gradient
    context.fill()

    roundRect(context, 80, 76, width - 160, height - 152, height / 2 - 76)
    context.fillStyle = '#f5f7fc'
    context.fill()
    context.lineWidth = 6
    context.strokeStyle = '#cdd3e0'
    context.stroke()

    context.globalAlpha = 0.45
    context.strokeStyle = '#5e667a'
    context.lineWidth = 3
    for (let x = 110; x < width - 110; x += 28) {
      context.beginPath()
      context.moveTo(x, height * 0.22)
      context.lineTo(x + 14, height * 0.22)
      context.moveTo(x, height * 0.78)
      context.lineTo(x + 14, height * 0.78)
      context.stroke()
    }
    context.globalAlpha = 1
  })
  belt.position.z = CONVEYOR_CENTER_Z
  belt.position.y = 0.04
  group.add(belt)

  return group
}

export function createConveyorBeltMarkers(count = 38): { group: THREE.Group, markers: BeltMarkerRenderItem[] } {
  const group = new THREE.Group()
  const markers: BeltMarkerRenderItem[] = []
  const markerGeometry = new THREE.CylinderGeometry(0.05, 0.05, 0.025, 18)
  const markerMaterial = new THREE.MeshStandardMaterial({
    color: '#5b6478',
    metalness: 0.04,
    roughness: 0.7,
  })

  for (let index = 0; index < count; index += 1) {
    const marker = new THREE.Mesh(markerGeometry, markerMaterial)
    marker.rotation.x = Math.PI / 2
    marker.receiveShadow = true
    const position = conveyorPositionAt(index / count)
    marker.position.set(position.x, 0.18, position.z)
    group.add(marker)
    markers.push({ index, mesh: marker, total: count })
  }

  return { group, markers }
}
