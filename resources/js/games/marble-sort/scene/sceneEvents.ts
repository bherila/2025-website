import { type GameState, type MarbleColor } from '../gameEngine'

export interface OpenedBoxEvent {
  color: MarbleColor
  position: GameState['boxes'][number]['position']
}

export function computeOpenedBoxEvents(previous: GameState | null, next: GameState): OpenedBoxEvent[] {
  if (!previous || previous.level !== next.level || previous.seed !== next.seed || next.moves <= previous.moves) {
    return []
  }

  const nextBoxIds = new Set(next.boxes.map((box) => box.id))

  return previous.boxes
    .filter((box) => !nextBoxIds.has(box.id))
    .map((box) => ({
      color: box.color,
      position: { ...box.position },
    }))
}
