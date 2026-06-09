interface AppInitialData {
  authenticated?: boolean
  isAdmin?: boolean
  permissions?: string[]
}

function readInitialData(): AppInitialData {
  const node = document.getElementById('app-initial-data')
  if (!node?.textContent) {
    return { isAdmin: true }
  }

  try {
    return JSON.parse(node.textContent) as AppInitialData
  } catch {
    return { isAdmin: true }
  }
}

export function hasPermission(permission: string): boolean {
  const initialData = readInitialData()

  return initialData.isAdmin === true || (initialData.permissions ?? []).includes(permission)
}

export function hasAnyPermission(permissions: string[]): boolean {
  return permissions.some((permission) => hasPermission(permission))
}

export function hasAllPermissions(permissions: string[]): boolean {
  return permissions.every((permission) => hasPermission(permission))
}
