# 3D Boat Physics Simulator

An interactive browser-based marine simulation built with Next.js, React Three Fiber, and Three.js. The project combines procedural water, weather, vessel handling, damage, and a responsive instrument HUD in a single local-first web application.

> **Project status:** the rendering and performance foundation is complete. Vessel motion now advances through a deterministic 60 Hz fixed timestep with interpolated rendering and typed per-vessel dynamics configuration. The current force model still uses custom buoyancy, drag, steering, and collision approximations; a rigid body with distributed point forces is the next physics milestone.

## Features

- Procedural Gerstner-wave ocean with matching CPU water sampling.
- Deterministic 60 Hz vessel simulation separated from the display refresh rate.
- Interpolated vessel rendering between completed physics states.
- Seeded simulation-only randomness for repeatable damage and hazard behavior.
- Typed trawler and speedboat dynamics configurations.
- GPU-generated wake field, rain, hurricane clouds, lightning, and storm effects.
- Trawler and speedboat handling with wind, current, planing, damage, repair, and beaching behavior.
- Procedural islands, seasonal terrain appearance, buoys, a whirlpool, and weather-gated tornado hazards.
- Adaptive Low, Medium, High, and Ultra quality tiers with ocean, terrain, weather, wake, and shadow budgets.
- Desktop keyboard controls and responsive touch controls for throttle, steering, repair, environment, wind, and current.
- Optional FPS, draw-call, triangle, and Calm/Storm benchmark diagnostics.
- Automated lint, type checking, dependency audit, production build, and desktop/mobile browser smoke tests.

## Simulation timing

`sim/core/FixedStepRunner.ts` owns the accumulator-based simulation clock:

- Physics advances at `1 / 60` second per step.
- A bounded substep budget prevents a suspended tab from causing a catch-up spiral.
- Excess backlog is recorded as dropped simulation time for diagnostics.
- Rendering interpolates between the previous and current physics transforms.
- Ocean and buoy visuals use interpolated simulation time, keeping water rendering aligned with vessel sampling.

Simulation-affecting randomness comes from `sim/core/SeededRandom.ts`, not the browser frame loop. Vessel-specific values live in `sim/vessels/VesselConfig.ts` rather than being scattered through the React component.

## Tech stack

- Next.js 16 and React 19
- React Three Fiber, Drei, and Three.js
- Zustand
- Tailwind CSS 4
- TypeScript and ESLint

## Getting started

### Requirements

- Node.js 22 recommended
- npm 10 or newer

### Install and run

```bash
npm ci
npm run dev
```

Open `http://localhost:3000`.

### Validation

```bash
npm run validate
```

This runs lint, TypeScript checking, the production build, and the full dependency audit.

## Controls

- `W` / `S` or arrow up/down: forward and reverse throttle
- `A` / `D` or arrow left/right: steer
- Hold `R` while nearly stopped with throttle cut: repair
- On touch devices, use the on-screen directional and repair controls

## Rendering quality and diagnostics

The quality selector is available in production and its selection is remembered. Auto mode chooses a conservative initial tier from the device profile, then adapts using measured rendering performance.

Append `?debug=1` to enable FPS metrics and Calm/Storm benchmark controls. Append `?debug=0` to clear the remembered debug preference.

## Project structure

- `app/`: App Router entry point and global styles
- `components/`: simulation rendering, vessel presentation, HUD, weather, wake, and diagnostics
- `components/boat/`: vessel audio and visual-damage subsystems
- `sim/core/`: fixed-step timing and deterministic simulation utilities
- `sim/vessels/`: typed vessel dynamics configuration
- `lib/`: deterministic terrain and water helpers
- `store/`: Zustand controls, telemetry, quality state, and shared high-frequency values
- `.github/workflows/`: validation and browser smoke testing

## Next physics milestone

The next Phase 2 slice will replace the scalar yaw and visual pitch/roll approximation with a six-degree-of-freedom rigid body. Buoyancy, propeller thrust, rudder forces, hydrodynamic resistance, and collision response will then be applied at physical points around a simplified hull.

## License

MIT. See [LICENSE](LICENSE).
