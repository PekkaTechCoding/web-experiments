# Architecture (short)

> Keep this file updated after major architectural changes.

## Overview
- **Engine**: owns rendering + main loop; delegates simulation to EngineCore.
- **EngineCore**: logic-only runtime (lifecycle + physics step + collisions). Testable in Node.
- **World**: creates scene content + physics bodies, and spawns entities.
- **Entity**: container for components + scripts.
- **Scripts**: components with optional lifecycle hooks: `onStart`, `update`, `onDestroy`, `onCollide`.

## Data flow
1. `app.js` creates Engine + World, wires them, then starts the loop.
2. World builds scene/physics and spawns entities.
3. EngineCore runs physics step and calls script lifecycle hooks.

## Folder layout
- `src/app.js` — minimal bootstrapping
- `src/engine.js` — rendering + loop (browser)
- `src/engine-core.js` — logic-only engine (tests)
- `src/world.js` — scene/physics population
- `src/entity.js` — entity + components
- `src/scripts/*` — gameplay scripts
- `test/*` — Vitest unit tests
