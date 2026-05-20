import * as THREE from 'three'

import {
  CONVEYOR_CENTER_Z,
  CONVEYOR_HEIGHT,
  CONVEYOR_WIDTH,
} from '../sceneConstants'
import { createCanvasPlane, roundRect } from '../threeUtils'

export function createConveyorTrack(): THREE.Group {
  const group = new THREE.Group()
  const belt = createCanvasPlane(CONVEYOR_WIDTH, CONVEYOR_HEIGHT, (context, width, height) => {
    context.clearRect(0, 0, width, height)
    roundRect(context, 8, 8, width - 16, height - 16, height / 2 - 8)
    context.fillStyle = '#eef2f7'
    context.fill()
    context.lineWidth = 18
    context.strokeStyle = '#768092'
    context.stroke()

    roundRect(context, 48, 42, width - 96, height - 84, height / 2 - 42)
    context.strokeStyle = '#ffffff'
    context.lineWidth = 10
    context.stroke()

    context.fillStyle = '#6b7280'
    for (let index = 0; index < 22; index += 1) {
      const x = 74 + index * ((width - 148) / 21)
      context.globalAlpha = index % 2 === 0 ? 0.45 : 0.22
      context.beginPath()
      context.ellipse(x, height / 2, 12, 22, 0, 0, Math.PI * 2)
      context.fill()
    }
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
