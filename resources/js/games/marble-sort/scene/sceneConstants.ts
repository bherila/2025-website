export const GRID_CELL_SIZE = 0.92
export const GRID_CELL_GAP = 0.18
export const GRID_ORIGIN_X = -1.1
export const GRID_ORIGIN_Z = -2.55
export const GRID_STEP_X = 1.1
export const GRID_STEP_Z = 0.82
export const CONVEYOR_CENTER_Z = 2.85
export const CONVEYOR_WIDTH = 5.4
export const CONVEYOR_HEIGHT = 1.05
export const CONVEYOR_MARBLE_Y = 0.36
export const MARBLE_DIAMETER = 0.27
export const MARBLE_RADIUS = MARBLE_DIAMETER / 2
export const CONVEYOR_PERIMETER = 2 * (CONVEYOR_WIDTH - CONVEYOR_HEIGHT) + Math.PI * CONVEYOR_HEIGHT
export const CONVEYOR_SLOT_FRACTION = MARBLE_DIAMETER / CONVEYOR_PERIMETER
// Belt = the top run that marbles ride on. The visible housing is wider in Z,
// but funnel alignment is to the belt, not the housing.
export const CONVEYOR_BELT_NORTH_Z = CONVEYOR_CENTER_Z - CONVEYOR_HEIGHT / 2
export const CONVEYOR_BELT_SOUTH_Z = CONVEYOR_CENTER_Z + CONVEYOR_HEIGHT / 2
// Funnel starts just south of the grid plate (which ends at Z ≈ 1.19) and
// exits slightly north of the belt's north edge so marbles physically fall
// south through the throat and land on the belt. The conveyor housing (wider
// in Z than the belt) reaches north past the belt edge into the funnel area,
// producing the "tucked under" visual without putting the throat geometry
// inside the belt's z range.
export const BASIN_NORTH_Z = 1.25
export const BASIN_CONVEYOR_OVERLAP = 0.08
export const BASIN_SOUTH_Z = CONVEYOR_BELT_NORTH_Z - BASIN_CONVEYOR_OVERLAP
export const BASIN_CENTER_Z = (BASIN_NORTH_Z + BASIN_SOUTH_Z) / 2
export const BASIN_FLOOR_Y = CONVEYOR_MARBLE_Y - 0.02
export const BASIN_TOP_HALF_WIDTH = 1.5
export const BASIN_EXIT_HALF_WIDTH = 0.42
export const BASIN_HALF_DEPTH = (BASIN_SOUTH_Z - BASIN_NORTH_Z) / 2
export const BASIN_HALF_WIDTH = BASIN_TOP_HALF_WIDTH
export const BASIN_EXIT_X = 0
export const BASIN_EXIT_Z = BASIN_SOUTH_Z
// Holding corridor south of the throat where a marble waits when the conveyor
// is full. world.ts side rails and arrivalGate.ts MUST use the same values.
export const BASIN_HOLD_LINE_Z = CONVEYOR_CENTER_Z + 0.05
export const BASIN_HOLD_CORRIDOR_HALF_WIDTH = BASIN_EXIT_HALF_WIDTH + MARBLE_RADIUS + 0.04
export const SORTING_STACK_Z = 4.45
export const SORTING_STACK_BLOCK_DEPTH = 0.44
export const SORTING_STACK_BLOCK_STEP_Z = 0.40
export const SORTING_STACK_BLOCK_STEP_Y = 0.06
export const SORTING_STACK_TOP_Y = 0.22
export const SORTING_STACK_VISIBLE_BLOCKS = 5
export const SCENE_BACKGROUND = '#54c074'
