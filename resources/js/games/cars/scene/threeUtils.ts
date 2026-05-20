import * as THREE from 'three'

export function findCarId(object: THREE.Object3D): string | null {
  let current: THREE.Object3D | null = object
  while (current) {
    const carId = current.userData.carId
    if (typeof carId === 'string') {
      return carId
    }
    current = current.parent
  }

  return null
}

export function createTextSprite(text: string, color: string, background: string, fontSize: number): THREE.Sprite {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 96
  const context = canvas.getContext('2d')
  if (context) {
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = background
    roundedRect(context, 8, 8, canvas.width - 16, canvas.height - 16, 22)
    context.fill()
    context.font = `800 ${fontSize}px Atkinson Hyperlegible Next, Arial, sans-serif`
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.lineWidth = 6
    context.strokeStyle = 'rgba(15, 23, 42, 0.45)'
    context.strokeText(text, canvas.width / 2, canvas.height / 2)
    context.fillStyle = color
    context.fillText(text, canvas.width / 2, canvas.height / 2)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true })

  return new THREE.Sprite(material)
}

export function createTextLabelMesh(
  text: string,
  color: string,
  background: string,
  fontSize: number,
  width: number,
  height: number,
): THREE.Mesh {
  const aspect = width / height
  const canvas = document.createElement('canvas')
  canvas.width = aspect >= 1 ? 256 : Math.round(256 * aspect)
  canvas.height = aspect >= 1 ? Math.round(256 / aspect) : 256
  const context = canvas.getContext('2d')
  if (context) {
    context.clearRect(0, 0, canvas.width, canvas.height)
    if (background !== 'rgba(0, 0, 0, 0)' && background !== 'transparent') {
      context.fillStyle = background
      roundedRect(context, 8, 8, canvas.width - 16, canvas.height - 16, 24)
      context.fill()
    }
    context.font = `900 ${fontSize}px Atkinson Hyperlegible Next, Arial, sans-serif`
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.lineWidth = 8
    context.strokeStyle = 'rgba(15, 23, 42, 0.55)'
    context.strokeText(text, canvas.width / 2, canvas.height / 2)
    context.fillStyle = color
    context.fillText(text, canvas.width / 2, canvas.height / 2)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false })

  return new THREE.Mesh(new THREE.PlaneGeometry(width, height), material)
}

export function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  context.beginPath()
  context.moveTo(x + radius, y)
  context.lineTo(x + width - radius, y)
  context.quadraticCurveTo(x + width, y, x + width, y + radius)
  context.lineTo(x + width, y + height - radius)
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  context.lineTo(x + radius, y + height)
  context.quadraticCurveTo(x, y + height, x, y + height - radius)
  context.lineTo(x, y + radius)
  context.quadraticCurveTo(x, y, x + radius, y)
  context.closePath()
}

export function clearGroup(group: THREE.Group): void {
  while (group.children.length > 0) {
    const child = group.children[0]
    if (child) {
      group.remove(child)
      disposeObject(child)
    }
  }
}

export function disposeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (mesh.geometry) {
      mesh.geometry.dispose()
    }

    const material = mesh.material
    if (Array.isArray(material)) {
      for (const item of material) {
        disposeMaterial(item)
      }
    } else if (material) {
      disposeMaterial(material)
    }
  })
}

function disposeMaterial(material: THREE.Material): void {
  const maybeTextured = material as THREE.Material & { map?: THREE.Texture }
  if (maybeTextured.map) {
    maybeTextured.map.dispose()
  }
  material.dispose()
}

export function lighten(hex: string): string {
  const color = new THREE.Color(hex)
  color.lerp(new THREE.Color('#ffffff'), 0.18)

  return `#${color.getHexString()}`
}
