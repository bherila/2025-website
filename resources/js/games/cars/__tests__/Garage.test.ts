import { drawDirectionalCountBadge } from '../scene/builders/garage'

interface PathCall {
  method: 'lineTo' | 'moveTo'
  x: number
  y: number
}

describe('Parking Pickup garage visuals', () => {
  it('draws the garage count badge pointer on the forward canvas edge', () => {
    const path: PathCall[] = []
    const context = {
      beginPath: jest.fn(),
      clearRect: jest.fn(),
      closePath: jest.fn(),
      fill: jest.fn(),
      fillText: jest.fn(),
      lineTo: jest.fn((x: number, y: number) => {
        path.push({ method: 'lineTo', x, y })
      }),
      moveTo: jest.fn((x: number, y: number) => {
        path.push({ method: 'moveTo', x, y })
      }),
    } as unknown as CanvasRenderingContext2D

    drawDirectionalCountBadge(context, 3)

    expect(path).toContainEqual({ method: 'lineTo', x: 128, y: 24 })
    expect(path).not.toContainEqual({ method: 'lineTo', x: 128, y: 232 })
    expect(context.fillText).toHaveBeenCalledWith('x3', 128, 130)
  })
})
