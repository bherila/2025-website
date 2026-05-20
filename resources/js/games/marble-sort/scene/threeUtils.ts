import * as THREE from 'three'

export function clearGroup(group: THREE.Group): void {
  const children = [...group.children]
  for (const child of children) {
    group.remove(child)
    disposeObject(child)
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
      material.forEach((item) => item.dispose())
    } else {
      material?.dispose()
    }
  })
}

export function findBoxId(object: THREE.Object3D): string | null {
  let current: THREE.Object3D | null = object
  while (current) {
    const boxId = current.userData.boxId
    if (typeof boxId === 'string') {
      return boxId
    }

    current = current.parent
  }

  return null
}

export function createTextSprite(
  text: string,
  options: {
    background?: string
    color?: string
    fontSize?: number
    height?: number
    width?: number
  } = {},
): THREE.Sprite {
  const width = options.width ?? 256
  const height = options.height ?? 128
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Could not create canvas context.')
  }

  context.clearRect(0, 0, width, height)
  if (options.background) {
    roundRect(context, 8, 8, width - 16, height - 16, 24)
    context.fillStyle = options.background
    context.fill()
  }
  context.font = `900 ${options.fontSize ?? 62}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.lineWidth = 10
  context.strokeStyle = '#111827'
  context.strokeText(text, width / 2, height / 2)
  context.fillStyle = options.color ?? '#ffffff'
  context.fillText(text, width / 2, height / 2)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true })

  return new THREE.Sprite(material)
}

export function createCanvasPlane(
  width: number,
  height: number,
  draw: (context: CanvasRenderingContext2D, width: number, height: number) => void,
): THREE.Mesh {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = Math.round((1024 * height) / width)
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Could not create canvas context.')
  }

  draw(context, canvas.width, canvas.height)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material)
  mesh.rotation.x = -Math.PI / 2

  return mesh
}

export function roundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
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
