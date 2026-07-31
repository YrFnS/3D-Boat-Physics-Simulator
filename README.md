# 3D Boat Physics Simulator

An interactive browser-based marine simulation built with Next.js, React Three Fiber, and Three.js. The project combines procedural water, weather, vessel handling, damage, and a responsive instrument HUD in a single local-first web application.

> **Project status:** this is a performance-optimized simulation prototype. The current vessel model uses custom approximations for buoyancy, drag, steering, and collisions. A fixed-timestep rigid-body and distributed-buoyancy system is planned for the next physics phase.

## Features

- Procedural Gerstner-wave ocean with matching CPU water sampling.
- GPU-generated wake field, rain, hurricane clouds, lightning, and storm effects.
- Trawler and speedboat handling with wind, current, planing, damage, repair, and beaching behavior.
- Procedural islands, seasonal terrain appearance, buoys, a whirlpool, and weather-gated tornado hazards.
- Adaptive Low, Medium, High, and Ultra quality tiers with ocean, terrain, weather, wake, and shadow budgets.
- Desktop keyboard controls and responsive touch controls for throttle, steering, repair, environment, wind, and current.
- Optional FPS, draw-call, triangle, and Calm/Storm benchmark diagnostics.
- Automated production build plus desktop and mobile Playwright smoke tests.

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
npm run lint
npm run typecheck
npm run build
```

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
- `components/`: simulation rendering, vessel behavior, HUD, weather, wake, and diagnostics
- `components/boat/`: vessel audio and visual-damage subsystems
- `lib/`: deterministic terrain and simulation helpers
- `store/`: Zustand controls, telemetry, quality state, and shared high-frequency values
- `.github/workflows/`: build and browser smoke validation

## License

MIT. See [LICENSE](LICENSE).
