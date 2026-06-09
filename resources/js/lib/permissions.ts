interface AppInitialData {
  authenticated?: boolean
  isAdmin?: boolean
  permissions?: string[]
}

function readInitialData(): AppInitialData {
  const node = document.getElementById('app-initial-data')
  if (!node?.textContent) {
    // Fail closed: absence of trustworthy initial data means "no permissions",
    // never implicit admin. The server is the real authorization boundary.
    return { isAdmin: false, permissions: [] }
  }

  try {
    return JSON.parse(node.textContent) as AppInitialData
  } catch {
    return { isAdmin: false, permissions: [] }
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
