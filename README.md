# Panzer — Web Edition

Web implementation of GMT Games' **Panzer** wargame (Consolidated Rules,
May 2025), built as a personal coding project.

> ⚠️ Game design and rules © GMT Games, LLC. This is an unofficial fan
> implementation for educational purposes. Don't distribute without
> permission.

## Stack

- **TypeScript** — typed language
- **Vite** — dev server + bundler
- **PixiJS 8** — WebGL 2D rendering for the hex map
- **React 18** — UI panels (Data Cards, controls, menus)
- **Zustand** — global state store
- **honeycomb-grid** — hex coordinate math
- **Vitest** — unit tests

## Quick start

```bash
npm install
npm run dev      # dev server on http://localhost:5173
npm test         # run unit tests in watch mode
npm run typecheck
npm run build    # production build to dist/
```

## What's in this starter

- A 16×12 hex grid that renders, with pan (right-drag) and zoom (wheel)
- Two units placed on the map: a Soviet T-34/76 M43 and a German PzKpfw IVH
- Click an empty hex or a unit to select it
- A Data Card panel (right) shows the selected unit's stats
- A Phase indicator (top-left) with a button to advance through the
  Sequence of Play
- A fully tested AP combat resolver (`src/engine/combat/apFire.ts`)
  reproducing the example of play from §4.4.3.2.6 of the rulebook
  (T-34 vs PzKpfw IVH at range 3)

## Architecture

The project enforces a **strict separation between game logic and rendering**:

```
src/
├── engine/              ← pure TypeScript, no DOM, no Pixi, no React
│   ├── units/           ← VehicleData types and blueprints
│   ├── combat/          ← AP fire resolution (tested)
│   ├── commands/        ← (todo) Command validation
│   ├── phases/          ← (todo) Sequence of Play state machine
│   ├── hex/             ← (todo) LOS, distances, pathfinding helpers
│   └── state/           ← Zustand store + state types
├── data/                ← (todo) JSON files for scenarios/maps
├── render/              ← PixiJS map renderer
├── ui/                  ← React components (panels, menus)
├── App.tsx
└── main.tsx
```

**Why this matters**: the `engine/` folder must be testable with `npm test`
without a browser, without Pixi, without React. Every rule of Panzer
becomes a pure function with unit tests. When you add the AI later, it
will use the same engine functions to evaluate moves.

## Rulebook ↔ Code map

| Rulebook section | File |
|---|---|
| 1.7 Game Counters / Data Cards | `engine/units/types.ts`, `blueprints.ts` |
| 4.0 Sequence of Play | `engine/state/store.ts` (`PHASE_ORDER`) |
| 4.2 Commands | `engine/state/types.ts` (`Command`) |
| 4.4.3 AP Firing | `engine/combat/apFire.ts` |
| 4.4.3.2.2 AP Hit Modifiers | `computeNetModifier()` |
| 4.4.3.2.3 AP Hit Number | `getAPHitNumber()` |
| 4.4.3.2.6 AP Damage & Effects | `resolveAPDamage()` |

## Roadmap

### Phase 0 — Foundations (this starter)
- [x] Project setup (TS, Vite, React, Pixi, Zustand, Vitest)
- [x] Hex grid rendering with pan/zoom
- [x] Unit selection and Data Card display
- [x] AP combat resolver with tests
- [x] Phase progression skeleton

### Phase 1 — Basic Game minimal
- [ ] Real AP Hit Table values from Game Card A (placeholders for now)
- [ ] FIRE / MOVE / SHORT_HALT / OVERWATCH / N/C command UI
- [ ] Spotting ranges (without LOS): cover lookup, modifiers
- [ ] Movement: hex selection, path validation, facing
- [ ] Front/Rear hit angle determination
- [ ] Wreck counters (KO / BU)
- [ ] Hot-seat 2-player loop

### Phase 2 — Basic Game complete
- [ ] Line-of-sight with terrain heights (Hills, Woods, Buildings)
- [ ] Brew-Up smoke effects
- [ ] Crest hexsides, slope hexsides
- [ ] Multiple terrain types in `data/terrain.json`
- [ ] Scenario loading from JSON

### Phase 3 — Solo vs AI
- [ ] AI opponent: minimax over command assignments, then MCTS
- [ ] Difficulty levels via search depth and evaluation weights

### Phase 4 — Advanced Game
- [ ] Leg units, towed guns, artillery
- [ ] Indirect fire, suppression
- [ ] Command Control rules

### Phase 5 — Optional Rules
- [ ] Morale, hidden units, weather, etc.

## Notes on data accuracy

The penetration values, range thresholds, and the AP Hit Table in this
starter are **illustrative placeholders** based on the rulebook's general
patterns. Before doing any serious play, cross-reference with:

- The actual GMT Game Cards (especially Card A for the AP Hit Table)
- The Vehicle Data Cards for each unit's exact ranges and penetration
- The Terrain Effects Table on Game Card A or B

## License

Code: MIT (yours to do whatever with).
Game design, art, and rule text: © GMT Games, LLC.
