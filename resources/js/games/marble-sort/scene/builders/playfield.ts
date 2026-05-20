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
    new THREE.PlaneGeometry(11, 14),
    new THREE.MeshBasicMaterial({ color: '#54c074' }),
  )
  grass.rotation.x = -Math.PI / 2
  grass.position.set(0, -0.06, 0)
  group.add(grass)

  const basin = createCanvasPlane(7.0, 7.6, (context, width, height) => {
    context.clearRect(0, 0, width, height)
    roundRect(context, 30, 26, width - 60, height - 110, 110)
    context.fillStyle = '#dceedd'
    context.fill()
    context.lineWidth = 26
    context.strokeStyle = '#368754'
    context.stroke()

    context.globalAlpha = 0.4
    context.fillStyle = '#ffffff'
    roundRect(context, 70, 60, width - 140, height * 0.18, 60)
    context.fill()
    context.globalAlpha = 1

    context.beginPath()
    context.moveTo(width * 0.08, height * 0.78)
    context.quadraticCurveTo(width * 0.34, height * 0.86, width * 0.4, height - 22)
    context.lineTo(width * 0.6, height - 22)
    context.quadraticCurveTo(width * 0.66, height * 0.86, width * 0.92, height * 0.78)
    context.strokeStyle = '#368754'
    context.lineWidth = 24
    context.stroke()
  })
  basin.position.set(0, 0, -0.95)
  group.add(basin)

  const gridPlate = new THREE.Mesh(
    new THREE.BoxGeometry(3.8, 0.08, 4.7),
    new THREE.MeshStandardMaterial({ color: '#e3eaf5', roughness: 0.55, transparent: true, opacity: 0.8 }),
  )
  gridPlate.position.set(0, 0.02, GRID_ORIGIN_Z + GRID_STEP_Z * 2)
  gridPlate.receiveShadow = true
  group.add(gridPlate)

  for (let row = 0; row < 5; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      const cell = new THREE.Mesh(
        new THREE.BoxGeometry(GRID_CELL_SIZE - GRID_CELL_GAP, 0.06, GRID_CELL_SIZE - GRID_CELL_GAP),
        new THREE.MeshStandardMaterial({ color: '#f1f4fb', roughness: 0.6, transparent: true, opacity: 0.9 }),
      )
      cell.position.set(GRID_ORIGIN_X + column * GRID_STEP_X, 0.09, GRID_ORIGIN_Z + row * GRID_STEP_Z)
      cell.receiveShadow = true
      group.add(cell)
    }
  }

  const funnel = createCanvasPlane(5.4, 1.4, (context, width, height) => {
    context.clearRect(0, 0, width, height)
    context.beginPath()
    context.moveTo(28, 18)
    context.quadraticCurveTo(width * 0.3, height * 0.2, width * 0.42, height - 24)
    context.lineTo(width * 0.58, height - 22)
    context.quadraticCurveTo(width * 0.7, height * 0.2, width - 28, 18)
    context.strokeStyle = '#368754'
    context.lineWidth = 22
    context.stroke()
  })
  funnel.position.set(0, 0.05, CONVEYOR_CENTER_Z - 0.78)
  group.add(funnel)

  return group
}
