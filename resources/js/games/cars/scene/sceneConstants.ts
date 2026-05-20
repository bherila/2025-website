import { BOARD_HEIGHT as GAME_BOARD_HEIGHT, BOARD_WIDTH as GAME_BOARD_WIDTH } from '../gameTypes'

export const CELL_SIZE = 0.56
export const FIELD_Z = 2.7
export const PARKING_Z = -5.0
export const QUEUE_Z = -10.2
export const PASSENGER_SPEED = 1.08
export const CAR_MOVE_SECONDS_PER_UNIT = 0.16
export const MIN_CAR_MOVE_DURATION = 0.82
export const BLOCKED_BOUNCE_DURATION = 0.58
export const PARKED_ROTATION = Math.PI
export const PARKING_SLOT_TILT = 0.16

export const INCOMING_LANE_Z = PARKING_Z + 1.50
export const OUTGOING_LANE_Z = PARKING_Z + 2.20

export const BOARD_WIDTH = GAME_BOARD_WIDTH
export const BOARD_HEIGHT = GAME_BOARD_HEIGHT
export const BOARD_CENTER_X = (BOARD_WIDTH - 1) / 2
export const BOARD_CENTER_Y = (BOARD_HEIGHT - 1) / 2
