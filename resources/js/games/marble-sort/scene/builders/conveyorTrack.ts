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
  const belt = createCanvasPlane(CONVEYOR_WIDTH, CONVEYOR_HEIGHT, (context, width, height) => {
    context.clearRect(0, 0, width, height)
    roundRect(context, 5, 5, width - 10, height - 10, height / 2 - 5)
    context.fillStyle = '#f8fafc'
    context.fill()
    context.lineWidth = 22
    context.strokeStyle = '#dfe7f3'
    context.stroke()

    roundRect(context, 42, 38, width - 84, height - 76, height / 2 - 38)
    const gradient = context.createLinearGradient(0, 0, 0, height)
    gradient.addColorStop(0, '#8a91a3')
    gradient.addColorStop(0.48, '#626b7f')
    gradient.addColorStop(1, '#8f98aa')
    context.fillStyle = gradient
    context.fill()
    context.lineWidth = 5
    context.strokeStyle = '#485064'
    context.stroke()

    roundRect(context, 78, 78, width - 156, height - 156, height / 2 - 78)
    context.strokeStyle = '#ffffff'
    context.lineWidth = 12
    context.stroke()

    context.globalAlpha = 0.55
    context.strokeStyle = '#eef2ff'
    context.lineWidth = 3
    context.beginPath()
    context.moveTo(98, height * 0.34)
    context.lineTo(width - 98, height * 0.34)
    context.moveTo(98, height * 0.66)
    context.lineTo(width - 98, height * 0.66)
    context.stroke()
    context.globalAlpha = 1
  })
  belt.position.z = CONVEYOR_CENTER_Z
  belt.position.y = 0.03
  group.add(belt)

  const gate = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.12, CONVEYOR_HEIGHT * 0.82),
    new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.22 }),
  )
  gate.position.set(-0.12, 0.12, CONVEYOR_CENTER_Z)
  gate.castShadow = true
  group.add(gate)

  return group
}

export function createConveyorBeltMarkers(count = 34): { group: THREE.Group, markers: BeltMarkerRenderItem[] } {
  const group = new THREE.Group()
  const markers: BeltMarkerRenderItem[] = []
  const markerGeometry = new THREE.CylinderGeometry(0.065, 0.065, 0.035, 18)
  const markerMaterial = new THREE.MeshStandardMaterial({
    color: '#aeb6c7',
    metalness: 0.02,
    roughness: 0.62,
  })

  for (let index = 0; index < count; index += 1) {
    const marker = new THREE.Mesh(markerGeometry, markerMaterial)
    marker.rotation.x = Math.PI / 2
    marker.receiveShadow = true
    marker.position.copy(conveyorPositionAt(index / count))
    marker.position.y = 0.18
    group.add(marker)
    markers.push({ index, mesh: marker, total: count })
  }

  return { group, markers }
}
