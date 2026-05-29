# Parking Pickup

Parking Pickup is a browser game mounted at `/games/parking-pickup`. The player clears a randomly generated parking field by sending cars into temporary parking spaces while a continuous loop of passengers boards matching cars.

The page uses `resources/views/layouts/game.blade.php`, matching the PHR and Finance tool pattern: the game has a tool-specific Blade shell that skips the global site navigation instead of toggling `layouts.app`.

## Core Loop

1. A level starts with cars placed on a grid, a passenger loop, regular parking spaces, and one VIP parking space.
2. The player clicks a visible car. If the car has a clear path out of the grid, it follows its facing direction to the edge of the board, drives along the board edge, and turns into the first open regular parking space.
3. Passengers walk continuously around the active queue loop. They only try to board when they pass the gate beside the parking spaces.
4. A passenger boards only if a parked car of the same color has an open seat. If no matching car is parked, that passenger keeps walking around the loop.
5. When a car reaches capacity, the final boarding passenger finishes walking to the car, then the car backs out of the parking space, drives off the right side of the screen, and frees its parking space.
6. The level is complete when every car has departed and the passenger queue is empty.

## Cars

- Car color determines which passengers can board.
- Car size determines capacity. There are three sizes: 4-seat (length 2), 6-seat (length 3), and 10-seat (length 4). Length is the number of grid cells the car occupies along its facing axis.
- The remaining seat-count badge renders as a billboard sprite that always reads upright in screen space, even as the car rotates between cardinal/diagonal headings.
- Car direction determines its exit path. Cars can face the four cardinal directions or a 45-degree diagonal direction.
- Diagonal cars occupy one grid cell per seat-length step along the diagonal. Their clear path follows that same diagonal heading until the car exits the board.
- Cars cannot cross through other cars.
- Cars cannot cross through active garage cells.
- A clicked car should visibly animate along a natural route: forward to the board edge, around the perimeter lane, then into the parking space. Cars should hold their heading on straight segments and rotate only as they turn into the next segment.
- If a blocked car is clicked, it should drive forward until it reaches the blocking car, then bounce back to its original position.
- Parked cars should align to the parking-space orientation when they arrive.
- Car labels should be readable at gameplay distance. The directional arrow and seat-count counter are rendered as separate square decals on the head side of the car body so they never get squashed by the car's length, and the arrow must point in the car's actual travel direction.
- Hidden garage cars become visible only when they pop out onto the board.
- Some obstructed cars can have their color hidden while they remain blocked. A color-hidden car renders as a near-black silhouette with a "?" decal in place of the arrow, hiding both the color and the seat count; its real color is still used by the solver and passenger queue. The color automatically reveals when the car becomes unobstructed or when a power-up moves it into parking.

## Passenger Queue

- The queue is a continuous loop (stadium-shaped, with two semicircular caps and two straights), not a one-way line.
- Only passengers in the active loop are available to board parked cars.
- Two feeder paths curve into the back of the loop, holding additional passengers behind it.
- The two feeders drain sequentially, not in parallel: the left feeder is consumed first, and the right feeder only begins flowing once the left is empty. Side assignment is fixed per passenger at level generation, so a passenger does not visually switch sides while waiting.
- The loop perimeter is sized so that when at active capacity, the passengers visibly fill it with no extra gap.
- When an active-loop passenger boards, the rest of the loop shifts one slot forward so the visible front-of-loop passenger is always the next-in-queue to board. The trailing slot becomes empty and is refilled by the feeder front when it reaches the feeder join. Shifted passengers interpolate from their previous slot position to their new one so the advance reads as a forward step, not a teleport.
- Passengers from the active feeder walk into the back of the loop along a curved bezier path that joins tangentially.
- The feeder walkway track is drawn along the same path the passengers follow, including the straight continuation past the bezier's end (along its end tangent) that overflow passengers walk on, so the walkway never cuts off mid-queue. The track length scales with the level's feeder count and its far tail clips off-screen.
- Passenger positions should be stable while walking; they should not appear or disappear except when boarding.
- Passenger boarding is gate-based: a passenger is eligible to board only when their loop position crosses the parking gate at the bottom-front of the stadium.
- Boarding should be tolerant around the gate. If a matching car is already parked and ready while the passenger is at the gate, the passenger should board instead of being forced into another full loop. The boarding window extends more than one queue-slot past the gate so that a loop shift (which reassigns offsets and reseeds the gate cycle when another passenger boards) cannot bump a passenger past the window and force an extra lap before it matches.
- Boarding should not be globally blocked by unrelated car movement. Only a car that is still driving into its parking space is unavailable for boarding.
- A boarding passenger should visibly leave the queue and walk to the matched parked car instead of disappearing.
- A level is complete only when every car has departed AND both feeder queues plus the loop are empty.
- Limiting the active loop should make color and parking choices matter; a car parked too early may occupy a space until its matching passengers feed into the loop.

## Parking Spaces

- The parking area renders as a single rounded asphalt slab spanning the screen, with the VIP slot on the left and the regular slots to its right; locked slots show a green plus marker.
- All parking spaces (VIP, unlocked, and locked) are the same size and share a uniform slight tilt so the row reads as one row of angled spaces. Parked cars and their entry/exit routes are rotated by the same tilt so they align with the space they occupy instead of sliding in straight and rotating into place.
- The VIP, "+", and other slot labels render as flat textured meshes (not billboards) so they tilt together with their slot.
- Regular parking spaces are the primary constraint. Seven regular slots total; four are unlocked at the start of each level.
- The VIP parking space is separate and does not count against score penalties.
- If all regular parking spaces are occupied, the player can open another regular space.
- Opening more spaces makes the level easier but lowers the score.

### Two-Lane Road

- A two-lane road runs in front of the parking slots along the bottom edge of the asphalt slab.
- Incoming cars use the back lane (closer to the parking slots); outgoing cars use the front lane (closer to the field). Lanes are separated by a dashed white divider, and the two-lane layout prevents incoming and outgoing cars from overlapping when they pass each other.
- The road and asphalt extend past the viewport edges on both sides; departing cars drive off-screen along the front lane instead of disappearing inside the playfield.
- Parking and departure animations both run concurrently — clicking a second car while the first car is still moving must not interrupt either animation.

## Controls

- On portrait screens, the score and level summary is collapsed into a compact top bar so the play area gets most of the viewport.
- The primary action controls overlap the bottom edge of the gameplay area.
- Bottom controls are icon buttons. VIP, Shuffle, Fill, Open Spot, and Reset expose their text labels through shadcn tooltips on hover or focus instead of inline button text.
- The bottom bar styling matches the candy look shared with Marble Sort: the power-up buttons (VIP gold, Shuffle violet, Fill sky) are color-coded with a remaining-count badge and sit in a group divided from the Open Spot / Reset / Tutorial actions, and the desktop Level readout is a gradient pill.
- VIP, Shuffle, and Fill use shadcn confirmation dialogs before the power-up action is committed.
- Each power-up confirmation dialog includes a short description of the effect and a clear action button such as "Use VIP".
- Open Spot has a tooltip but does not use the power-up confirmation flow because it is a parking-space action, not an inventory power-up.

## Garages

- Garages hold hidden cars behind a visible front car.
- Each active garage occupies one real board cell. A visible car emerging from that garage may share its tail cell with the garage so it appears partly inside the doorway.
- The garage cell blocks car placement and car movement like any other obstacle.
- The garage UI is neutral and should not reveal the hidden cars' colors.
- The player should clearly see how many cars remain in the garage through a count badge. The badge is a flat arrow-shaped tag laid above the garage so that its tip points in the direction the next emerging car will travel.
- When the visible garage car leaves the field, the next hidden car pops out.
- Each reveal decreases the garage count.
- Once no hidden cars remain in a garage, the garage cell and UI disappear and no longer block movement.

## Power-Ups

### VIP

VIP lets the player select one visible car from anywhere on the field and place it into the VIP slot. This can bypass normal blocking, but the VIP slot must be open.
The VIP button opens a confirmation dialog before entering VIP selection mode. The power-up is spent when the user selects a car.

### Shuffle

Shuffle changes active car colors into another solvable arrangement based on the current passenger queue. It is a recovery tool for cases where parking choices have made the board difficult or unwinnable.
The Shuffle button opens a confirmation dialog before the colors are changed and the inventory count is consumed.

### Fill

Fill is a cheat power-up. It pulls passengers from the queue in FIFO order to fill all currently parked cars as much as possible, then completed cars depart.
The Fill button opens a confirmation dialog before passengers are pulled from the queue and the inventory count is consumed.

## Level Generation

- Levels are randomly generated from a deterministic seed for the level number.
- The playfield is a 20×14 grid. Car counts and the passenger queue scale with level so the field stays densely packed and the queue stays long even at high levels: level 1 starts at roughly 15 cars and the cap grows by ~2.4 per level up to 60. The hidden-garage tier scales similarly so the visible field stays manageable while reserve cars wait behind it.
- Generated levels must be provably winnable without power-ups or opening extra regular parking spaces.
- Generation is validated in two stages: first the board solver proves that every car can physically leave the field, then a parking/queue simulator proves that a scripted solution can finish with only the four starting regular slots.
- A target solver order is computed during generation and resequenced so later recovery tools can still reason from the same board order.
- The solver treats active garage cells as blockers and removes a garage blocker only after the last hidden car has popped out.
- The solver and placement checks support cardinal and diagonal car footprints, so diagonal cars are part of normal generated levels.
- Car colors and passenger queue order are planned as service windows instead of simple same-color blocks. Intended cars get passengers close enough to clear on the scripted path, while tempting movable decoys can have passengers delayed beyond the active loop.
- The queue planner accepts post-tutorial candidates only when the generated level has strategic pressure: multiple movable choices, delayed decoys, and a planned solution that uses multiple starting slots without requiring rescue actions.
- Ten-seat cars are useful anchors because parking one too early can occupy a slot until its passengers feed into the active loop. Four-seat cars are used as relief valves because they can clear slots quickly when they are part of the intended window.
- Hidden-color cars are selected only from obstructed visible cars after the solvable order has been established, so hiding color information does not change the underlying solution.
- The active loop is smaller than the total passenger queue on normal levels, so the full passenger queue is not available immediately. The loop sizes itself to the active capacity so it never has wrap-around overlap — when capacity shrinks (late-level cleanup), excess empty slots are pruned so passengers never land in near-duplicate positions.
- Feeder passengers are persistent render items: when one boards or shifts forward in the queue, the rest interpolate to their new positions instead of teleporting between rebuilds.
- Difficulty ramps gradually with level: levels 1–3 remain tutorial-like, levels 4–9 introduce at least one queue-aware decoy choice, level 10+ requires more decision pressure, and super-hard levels require several wrong-choice traps while still preserving a no-rescue solution.

## Scoring And Progress

- Progress is saved in `localStorage`.
- Saved progress includes current level, total score, high score, and power-up inventory.
- Level score is finalized when the level is complete.
- Using more regular parking spaces lowers the level score.
- Extra moves can also reduce score.
- The VIP space does not count as a regular parking space for scoring.
- Completing a level awards a random power-up.

## Current Implementation Notes

- Route: `/games/parking-pickup`
- React entry: `resources/js/games/cars/index.tsx`
- Game shell/state orchestration: `resources/js/games/cars/CarsGame.tsx`
- Controls and HUD: `resources/js/games/cars/GameControls.tsx`
- Main scene orchestration: `resources/js/games/cars/CarsScene.tsx` (component, lifecycle, signature-driven rebuilds)
- Static scene builders (one-per-feature): `resources/js/games/cars/scene/builders/{ground,queueTrack,parkingRow,field,garage,carMesh,passengerMesh}.ts`
- Animation modules: `resources/js/games/cars/scene/animation/{passengers,boardingPassengers,movingCars,blockedCar,departingCar}.ts`
- Scene geometry helpers (queue/feeder/lane math): `resources/js/games/cars/scene/sceneGeometry.ts`
- Scene rendering helpers: `resources/js/games/cars/scene/threeUtils.ts`
- Scene constants (z-positions, lane positions, animation speeds): `resources/js/games/cars/scene/sceneConstants.ts`
- Game engine: `resources/js/games/cars/gameEngine.ts`
- Shared game contracts: `resources/js/games/cars/gameTypes.ts`
- Progress persistence: `resources/js/games/cars/gameProgress.ts`
- Progress key: `bwh.cars-game.progress.v2`
- Rendering uses Three.js through Vite.
- The active loop capacity is intentionally capped in the game engine; remaining visible passengers render on feeder lanes and are not eligible to board until they enter the loop.
- The interface should be playable on a smartphone in portrait orientation, with compact controls and a camera framing that keeps the queue, parking row, and board visible without horizontal scrolling. Landscape support is best-effort with wider aspect ratios.
- Scene rebuilds are split into a static group (ground, queue track, parking row, field) keyed by a signature, and a dynamic group rebuilt every state update. Moving cars (parking and blocked animations) are retained across rebuilds so animations are never cut short when other state changes.
- Car decal textures (the arrow + seat-count badge on top of each car) are cached by remaining seat count, colorblind pattern mode, and hidden-color state so the canvas is only drawn once per distinct value.

## Open Questions

- Whether Fill should ignore color permanently or only fill color-matching parked cars.
- Final tuning for level difficulty, score penalties, and power-up award rates.
- Whether to add sounds, level-complete animation, or more explicit blocked-path feedback.
- Whether feeder path size should vary per level or stay fixed for readability.
