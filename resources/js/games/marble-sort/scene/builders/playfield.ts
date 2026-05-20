import * as THREE from 'three'

import {
  CONVEYOR_CENTER_Z,
  GRID_CELL_GAP,
  GRID_CELL_SIZE,
  GRID_ORIGIN_X,
  GRID_ORIGIN_Z,
  GRID_STEP_X,
  GRID_STEP_Z,
} from '../sceneConstants'
import { createCanvasPlane, roundRect } from '../threeUtils'

export function createPlayfield(): THREE.Group {
  const group = new THREE.Group()

  const grass = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 12),
    new THREE.MeshBasicMaterial({ color: '#4dad62' }),
  )
  grass.rotation.x = -Math.PI / 2
  grass.position.set(0, -0.03, -0.5)
  group.add(grass)

  const basin = createCanvasPlane(6.6, 6.4, (context, width, height) => {
    context.clearRect(0, 0, width, height)
    roundRect(context, 34, 28, width - 68, height - 68, 72)
    context.fillStyle = 'rgba(210, 232, 223, 0.76)'
    context.fill()
    context.lineWidth = 18
    context.strokeStyle = 'rgba(42, 126, 69, 0.85)'
    context.stroke()

    context.beginPath()
    context.moveTo(width * 0.35, height * 0.82)
    context.lineTo(width * 0.47, height * 0.98)
    context.lineTo(width * 0.53, height * 0.98)
    context.lineTo(width * 0.65, height * 0.82)
    context.strokeStyle = 'rgba(42, 126, 69, 0.85)'
    context.lineWidth = 20
    context.stroke()
  })
  basin.position.set(0, 0, 0.45)
  group.add(basin)

  const gridPlate = new THREE.Mesh(
    new THREE.BoxGeometry(3.65, 0.08, 4.55),
    new THREE.MeshStandardMaterial({ color: '#d8e2f5', roughness: 0.55, transparent: true, opacity: 0.72 }),
  )
  gridPlate.position.set(0, 0.02, 1.0)
  gridPlate.receiveShadow = true
  group.add(gridPlate)

  for (let row = 0; row < 5; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      const cell = new THREE.Mesh(
        new THREE.BoxGeometry(GRID_CELL_SIZE - GRID_CELL_GAP, 0.05, GRID_CELL_SIZE - GRID_CELL_GAP),
        new THREE.MeshStandardMaterial({ color: '#e7eefc', roughness: 0.65, transparent: true, opacity: 0.88 }),
      )
      cell.position.set(GRID_ORIGIN_X + column * GRID_STEP_X, 0.09, GRID_ORIGIN_Z - row * GRID_STEP_Z)
      cell.receiveShadow = true
      group.add(cell)
    }
  }

  const funnel = createCanvasPlane(5.8, 1.3, (context, width, height) => {
    context.clearRect(0, 0, width, height)
    context.beginPath()
    context.moveTo(24, 12)
    context.quadraticCurveTo(width * 0.32, height * 0.42, width * 0.43, height - 14)
    context.lineTo(width * 0.57, height - 14)
    context.quadraticCurveTo(width * 0.68, height * 0.42, width - 24, 12)
    context.strokeStyle = 'rgba(42, 126, 69, 0.9)'
    context.lineWidth = 18
    context.stroke()
  })
  funnel.position.set(0, 0.04, CONVEYOR_CENTER_Z + 1.05)
  group.add(funnel)

  return group
}
