let isInstalled = false

function isFocusedNumberInput(target: EventTarget | null): target is HTMLInputElement {
  return target instanceof HTMLInputElement
    && target.type === 'number'
    && document.activeElement === target
}

function preventFocusedNumberInputWheelChange(event: WheelEvent): void {
  if (!isFocusedNumberInput(event.target)) {
    return
  }

  event.preventDefault()
}

export function installNumberInputWheelGuard(): void {
  if (isInstalled || typeof document === 'undefined') {
    return
  }

  document.addEventListener('wheel', preventFocusedNumberInputWheelChange, {
    capture: true,
    passive: false,
  })
  isInstalled = true
}

export function uninstallNumberInputWheelGuard(): void {
  if (!isInstalled || typeof document === 'undefined') {
    return
  }

  document.removeEventListener('wheel', preventFocusedNumberInputWheelChange, true)
  isInstalled = false
}
