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
    new THREE.PlaneGeometry(9.4, 12.8),
    new THREE.MeshBasicMaterial({ color: '#4dad62' }),
  )
  grass.rotation.x = -Math.PI / 2
  grass.position.set(0, -0.04, -0.7)
  group.add(grass)

  const basin = createCanvasPlane(6.7, 6.8, (context, width, height) => {
    context.clearRect(0, 0, width, height)
    roundRect(context, 34, 26, width - 68, height - 82, 86)
    context.fillStyle = 'rgba(196, 226, 211, 0.78)'
    context.fill()
    context.lineWidth = 20
    context.strokeStyle = 'rgba(48, 132, 74, 0.92)'
    context.stroke()

    context.globalAlpha = 0.24
    context.fillStyle = '#ffffff'
    roundRect(context, 62, 54, width - 124, height * 0.28, 54)
    context.fill()
    context.globalAlpha = 1

    context.beginPath()
    context.moveTo(width * 0.08, height * 0.75)
    context.quadraticCurveTo(width * 0.34, height * 0.82, width * 0.43, height - 28)
    context.lineTo(width * 0.57, height - 28)
    context.quadraticCurveTo(width * 0.66, height * 0.82, width * 0.92, height * 0.75)
    context.strokeStyle = 'rgba(48, 132, 74, 0.95)'
    context.lineWidth = 22
    context.stroke()
  })
  basin.position.set(0, 0, -0.55)
  group.add(basin)

  const gridPlate = new THREE.Mesh(
    new THREE.BoxGeometry(3.65, 0.08, 4.55),
    new THREE.MeshStandardMaterial({ color: '#d8e2f5', roughness: 0.55, transparent: true, opacity: 0.72 }),
  )
  gridPlate.position.set(0, 0.02, GRID_ORIGIN_Z + GRID_STEP_Z * 2)
  gridPlate.receiveShadow = true
  group.add(gridPlate)

  for (let row = 0; row < 5; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      const cell = new THREE.Mesh(
        new THREE.BoxGeometry(GRID_CELL_SIZE - GRID_CELL_GAP, 0.05, GRID_CELL_SIZE - GRID_CELL_GAP),
        new THREE.MeshStandardMaterial({ color: '#e7eefc', roughness: 0.65, transparent: true, opacity: 0.88 }),
      )
      cell.position.set(GRID_ORIGIN_X + column * GRID_STEP_X, 0.09, GRID_ORIGIN_Z + row * GRID_STEP_Z)
      cell.receiveShadow = true
      group.add(cell)
    }
  }

  const funnel = createCanvasPlane(5.9, 1.25, (context, width, height) => {
    context.clearRect(0, 0, width, height)
    context.beginPath()
    context.moveTo(22, 16)
    context.quadraticCurveTo(width * 0.32, height * 0.2, width * 0.43, height - 16)
    context.lineTo(width * 0.57, height - 14)
    context.quadraticCurveTo(width * 0.68, height * 0.2, width - 22, 16)
    context.strokeStyle = 'rgba(42, 126, 69, 0.9)'
    context.lineWidth = 18
    context.stroke()
  })
  funnel.position.set(0, 0.04, CONVEYOR_CENTER_Z - 0.72)
  group.add(funnel)

  return group
}
