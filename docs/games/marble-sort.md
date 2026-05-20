# Marble Sort

Marble Sort is a browser game mounted at `/games/marble-sort`. The player clears a chute-fed grid of marble boxes by busting boxes open, feeding their marbles onto a conveyor, and letting matching sorting blocks collect marbles in sets of three.

The page uses `resources/views/layouts/game.blade.php`, matching the Parking Pickup game shell: the game has a focused Blade mount that skips the global site navigation and loads a dedicated Vite React entry.

## Core Loop

1. A level starts with a 3-column by 5-row grid, side chute counters, a conveyor loop, and sorting block stacks.
2. The player clicks a box in the grid. If the conveyor has room for the box payload, the box busts open and releases nine marbles of its true color.
3. Released marbles fall from the grid basin into the conveyor.
4. Conveyor marbles circulate past the sorting gate.
5. When a marble reaches the gate, it fills the top compatible sorting block if that block has an open slot.
6. Sorting blocks hold three marbles. Once all three slots are filled, the completed block clears and exposes the next block in that stack.
7. Chutes refill open grid squares in their row until their counter reaches zero.
8. The level is complete when every grid box is gone, every chute counter is zero, no marbles remain in flight or on the conveyor, and every sorting block stack is cleared.

## Boxes And Grid

- The grid is fixed at three columns by five rows for the first version.
- Each box contains exactly nine marbles.
- Box color determines which sorting block can consume the released marbles.
- Some boxes are hidden and render as question-mark blocks until opened. Their true color is still known to the level generator and solver.
- A clicked box is only opened when the conveyor has enough free capacity for all nine marbles.
- Opening a box bursts the crate with a small ring + shard effect, then the nine marbles fall in a two-stage cascade: first vertically from the grid cell into the basin funnel mouth, then forward onto the conveyor belt.
- Opening a box increments moves and may reduce the level score.
- Open grid cells are eligible for chute refills.

## Chutes

- Chutes sit on the left and right sides of selected grid rows.
- A chute displays the number of boxes it still needs to eject.
- After a box opens, the row's chutes try to refill open cells in that row.
- Each ejected box decrements its chute counter.
- Chute boxes are assigned during level generation and preserve the level's solvable color order.
- When a chute counter reaches zero, that chute remains as an empty visual counter and no longer injects boxes.

## Conveyor

- The conveyor is a continuous stadium-shaped loop below the grid.
- The conveyor has finite marble capacity. This makes the order of box openings matter.
- Marbles are drawn as a packed queue (shoulder-to-shoulder along the belt), spaced by marble diameter rather than spread evenly across the loop.
- Marbles keep their stable identity while circulating and should not teleport between updates.
- Sorting is gate-based: only a marble crossing the sorting gate may enter a block.
- If no compatible block has a slot when a marble reaches the gate, the marble keeps circulating.
- If circulating and falling marbles fill the belt, the level enters a game-over state and must be reset.
- The level generator sizes sorting stacks so every generated marble has a compatible destination.

## Sorting Blocks

- Sorting blocks are arranged in vertical stacks below the conveyor. The active (depth 0) block sits closest to the conveyor; upcoming blocks recede behind it so the player can read which colors are queued.
- The active block shows three lego-stud-style slots on its top face. Empty slots render as recessed dark dimples; filled slots render as colored studs with a seated marble.
- A slot can only accept a marble whose color matches the block color.
- A filled block clears with a small confetti burst, and the next block tweens up from below to take its place.
- Stack order is randomized. A color may be buried under other colors, so the player needs to open boxes in an order that keeps the belt from filling before matching receptacles are exposed.
- Empty stacks render as inactive lanes.
- Completing blocks is the primary objective; all stacks must be empty to complete the level.

## Controls

- The game uses the same responsive shell pattern as Parking Pickup.
- On portrait screens, the HUD is compact so the play field remains visible.
- Bottom controls are icon buttons with tooltips.
- Reset restarts the current level.
- Tutorial opens the local tutorial overlay.
- Colorblind mode adds stable color labels and patterns to boxes, marbles, and sorting blocks.

## Power-Ups

### Magnet

Magnet pulls currently conveyor-held marbles into matching sorting blocks as far as available slots allow.

### Shuffle

Shuffle changes the visible grid and chute box colors into another solvable arrangement without changing counts.

### Extra Belt

Extra Belt temporarily increases conveyor capacity for the current level.

Each power-up uses a confirmation dialog before spending inventory.

## Level Generation

- Levels are randomly generated from a deterministic seed for the level number.
- Generated levels must be solvable by a simple solver pass before they are accepted.
- The solver opens boxes whose colors match currently exposed receptacles, drains the conveyor into matching blocks, and verifies that chute refills plus randomized sorting stacks can finish before the belt fills.
- Difficulty ramps gradually with level:
  - more colors are introduced,
  - more chute-fed boxes appear,
  - sorting stacks get deeper,
  - more hidden boxes appear,
  - conveyor capacity becomes tighter relative to available boxes.
- If random generation fails repeatedly, the engine falls back to a conservative open level that is still solvable.

## Scoring And Progress

- Progress is saved in `localStorage`.
- Saved progress includes current level, total score, high score, and power-up inventory.
- A level snapshot is saved separately so refreshing the page resumes the active board.
- Level score is finalized when the level is complete.
- Extra moves and power-up use reduce score.
- Completing a level awards a random power-up.

## Current Implementation Notes

- Route: `/games/marble-sort`
- React entry: `resources/js/games/marble-sort/index.tsx`
- Game shell/state orchestration: `resources/js/games/marble-sort/MarbleSortGame.tsx`
- Controls and HUD: `resources/js/games/marble-sort/GameControls.tsx`
- Main scene orchestration: `resources/js/games/marble-sort/MarbleSortScene.tsx`
- Static scene builders live under `resources/js/games/marble-sort/scene/builders/`.
- Animation modules live under `resources/js/games/marble-sort/scene/animation/`.
- Game engine: `resources/js/games/marble-sort/gameEngine.ts`
- Shared game contracts: `resources/js/games/marble-sort/gameTypes.ts`
- Progress persistence: `resources/js/games/marble-sort/gameProgress.ts`
- Progress key: `bwh.marble-sort.progress.v1`
- Rendering uses Three.js through Vite.
- The first version uses automatic conveyor sorting rather than manual drag-and-drop.

## Open Questions

- Final tuning for level difficulty, conveyor capacity, score penalties, and power-up award rates.
- Whether later versions should support manual sorting gestures.
- Whether to add sounds, haptics, or a more elaborate box-bust animation.
