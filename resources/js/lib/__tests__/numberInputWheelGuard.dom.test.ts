import { installNumberInputWheelGuard, uninstallNumberInputWheelGuard } from '@/lib/numberInputWheelGuard'

function dispatchWheel(target: Element): WheelEvent {
  const event = new WheelEvent('wheel', {
    bubbles: true,
    cancelable: true,
    deltaY: 120,
  })

  target.dispatchEvent(event)

  return event
}

describe('numberInputWheelGuard', () => {
  afterEach(() => {
    uninstallNumberInputWheelGuard()
    document.body.innerHTML = ''
  })

  it('prevents wheel changes on a focused number input', () => {
    const input = document.createElement('input')
    input.type = 'number'
    document.body.append(input)
    input.focus()

    installNumberInputWheelGuard()

    expect(dispatchWheel(input).defaultPrevented).toBe(true)
  })

  it('allows wheel events on unfocused number inputs', () => {
    const input = document.createElement('input')
    input.type = 'number'
    document.body.append(input)

    installNumberInputWheelGuard()

    expect(dispatchWheel(input).defaultPrevented).toBe(false)
  })

  it('allows wheel events on other focused inputs', () => {
    const input = document.createElement('input')
    input.type = 'text'
    document.body.append(input)
    input.focus()

    installNumberInputWheelGuard()

    expect(dispatchWheel(input).defaultPrevented).toBe(false)
  })
})
