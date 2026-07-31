# 3D Boat Physics Simulator

An interactive browser-based marine simulation built with Next.js, React Three Fiber, and Three.js. The project combines procedural water, weather, vessel handling, damage, and a responsive instrument HUD in a single local-first web application.

> **Project status:** the rendering and performance foundation is complete. Vessel motion advances through a deterministic 60 Hz fixed timestep and uses a custom six-degree-of-freedom body with center-of-mass integration, principal-axis inertia, gyroscopic coupling, distributed hull forces, and Rapier-backed compound-hull contacts. The next physics work is calibration and broader collision-scenario coverage.

## Features

- Procedural Gerstner-wave ocean with matching CPU water sampling.
- Deterministic 60 Hz vessel simulation separated from the display refresh rate.
- Interpolated vessel rendering between completed physics states.
- Seeded simulation-only randomness for repeatable damage and hazard behavior.
- Six-degree-of-freedom vessel motion with world-space linear and angular velocity.
- Center-of-mass-correct transform integration and principal-axis inertia.
- Twelve-point vessel-specific hull lattices for buoyancy and hydrodynamic resistance.
- Point-applied propeller, rudder, wind, planing, buoyancy, and drag forces.
- Rapier terrain and obstacle manifolds with compound vessel hull proxies.
- Off-center collision impulses, bounded penetration correction, contact friction, and impact-driven damage.
- Typed trawler and speedboat mass, hull, engine, inertia, damping, and force configurations.
- GPU-generated wake field, rain, hurricane clouds, lightning, and storm effects.
- Trawler and speedboat handling with wind, current, planing, damage, repair, and beaching behavior.
- Procedural islands, seasonal terrain appearance, buoys, a whirlpool, and weather-gated tornado hazards.
- Adaptive Low, Medium, High, and Ultra quality tiers with ocean, terrain, weather, wake, and shadow budgets.
- Desktop keyboard controls and responsive touch controls for throttle, steering, repair, environment, wind, and current.
- Optional FPS, draw-call, triangle, and Calm/Storm benchmark diagnostics.
- Automated lint, type checking, dependency audit, production build, and desktop/mobile/collision browser smoke tests.

## Simulation architecture

`sim/core/FixedStepRunner.ts` owns the accumulator-based simulation clock:

- Physics advances at `1 / 60` second per step.
- A bounded substep budget prevents a suspended tab from causing a catch-up spiral.
- Excess backlog is recorded as dropped simulation time for diagnostics.
- Rendering interpolates between the previous and current physics transforms.
- Ocean and buoy visuals use interpolated simulation time, keeping water rendering aligned with vessel sampling.

`sim/core/SixDofBody.ts` owns the authoritative vessel transform and momentum state:

- Linear velocity represents the world-space velocity of the center of mass.
- Angular velocity is exposed in world space for velocity-at-point calculations.
- Torque is transformed into principal body axes for inertia and damping.
- Euler's rigid-body equation includes the gyroscopic `ω × Iω` term.
- An offset center of mass is integrated without making the visual origin orbit during pitch and roll.
- Contact impulses can be applied at world positions, producing linear and angular velocity changes through the configured mass and principal inertia.
- Finite-state guards and vessel-specific angular limits prevent one invalid force from poisoning later steps.

`sim/vessels/DistributedHullForces.ts` evaluates the water interaction:

- Each vessel defines four longitudinal hull stations with port, center, and starboard samples.
- Every sample follows the vessel's full quaternion and queries the same Gerstner surface rendered by the ocean shader.
- Buoyancy is proportional to local immersion and damped by that point's vertical velocity.
- Forward and lateral water resistance use local point velocity relative to current, so angular motion naturally creates damping torque.
- The resulting forces are applied at their actual world positions, producing heave, pitch, roll, and yaw instead of directly assigning visual angles.

`sim/collision/RapierCollisionWorld.ts` owns contact geometry and manifold generation:

- The custom marine body remains authoritative for motion and hydrodynamics.
- A kinematic three-piece rounded hull proxy follows the completed fixed-step vessel transform.
- Procedural terrain is represented by a fixed triangle mesh, while navigation obstacles use updated sphere colliders.
- Rapier manifold normals, penetration, and contact points are converted into bounded normal and tangential impulses on `SixDofBody`.
- Terrain and obstacle impacts are classified independently so their response, audio, and damage thresholds can be tuned separately.
- Debug diagnostics expose contact sequence, impact speed, impulse, and penetration for automated browser validation.

Simulation-affecting randomness comes from `sim/core/SeededRandom.ts`, not the browser frame loop. Vessel-specific values and hull-force layouts live in `sim/vessels/VesselConfig.ts` rather than being scattered through the React component.

## Tech stack

- Next.js 16 and React 19
- React Three Fiber, Drei, and Three.js
- Rapier 3D
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

The browser smoke suite performs held propulsion and steering input at desktop and mobile sizes, plus an isolated Rapier contact-probe scenario. It validates finite and bounded position, linear and angular speed, quaternion normalization, direction normalization, submersion range, simulation-clock progress, observable vessel response, Rapier initialization, contact reporting, positive collision impulse, and bounded penetration.

## Project structure

- `app/`: App Router entry point and global styles
- `components/`: simulation rendering, vessel presentation, HUD, weather, wake, and diagnostics
- `components/boat/`: vessel audio and visual-damage subsystems
- `sim/core/`: fixed-step timing, deterministic randomness, and six-degree-of-freedom integration
- `sim/vessels/`: typed vessel configuration and distributed marine-force models
- `sim/collision/`: Rapier geometry, contact manifolds, and custom-body collision response
- `lib/`: deterministic terrain and water helpers
- `store/`: Zustand controls, telemetry, quality state, and shared high-frequency values
- `.github/workflows/`: validation and browser smoke testing

## Next physics milestone

The next Phase 2 slice will calibrate draft, transverse stability, turning circle, stopping distance, maximum speed, grounding friction, and collision damage for both vessels. It will also add repeatable shoreline, glancing-obstacle, and higher-speed impact scenarios before Phase 2 is closed.

## License

MIT. See [LICENSE](LICENSE).
