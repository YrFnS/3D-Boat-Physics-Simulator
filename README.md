# 3D Boat Physics Simulator

An interactive browser-based marine simulation built with Next.js, React Three Fiber, Three.js, and Rapier. The project combines procedural water, severe weather, calibrated six-degree vessel handling, route-based missions, free navigation, damage, recovery, and a responsive instrument suite in a local-first web application.

> **Project status:** the rendering/performance foundation and calibrated physics foundation are complete. Vessel motion advances through a deterministic 60 Hz timestep using a custom six-degree-of-freedom body, distributed hull forces, and Rapier-backed compound-hull contacts. Phase 3 is building the complete player experience on top of that validated simulation without replacing the physics core.

## Features

### Marine simulation

- Procedural Gerstner-wave ocean with matching CPU water sampling.
- Deterministic 60 Hz vessel simulation separated from display refresh rate.
- Interpolated vessel rendering between completed physics states.
- Seeded simulation-only randomness for repeatable damage and hazard behavior.
- Six-degree-of-freedom vessel motion with world-space linear and angular velocity.
- Center-of-mass-correct transform integration and principal-axis inertia.
- Twelve-point vessel-specific hull lattices for buoyancy and hydrodynamic resistance.
- Point-applied propeller, rudder, wind, planing, buoyancy, and drag forces.
- Rapier terrain and obstacle manifolds with compound vessel hull proxies.
- Off-center collision impulses, bounded penetration correction, contact friction, and impact-driven damage.
- Typed and calibrated trawler and speedboat configurations.

### World and rendering

- GPU-generated wake field, rain, hurricane clouds, lightning, and storm effects.
- Procedural islands, seasonal terrain, navigation buoys, ice, a whirlpool, and weather-gated tornado hazards.
- Adaptive Low, Medium, High, and Ultra quality tiers covering ocean, terrain, weather, wake, and shadow budgets.
- Recoverable WebGL context handling and unsupported-device guidance.
- Optional FPS, draw-call, triangle, and Calm/Storm benchmark diagnostics.

### Product and gameplay

- Responsive launch briefing with scenario and vessel selection.
- Open Water, Harbor Training, Storm Passage, and Winter Rescue missions.
- Chase, helm, orbit, and cinematic cameras.
- Pause, resume, restart, safe vessel recovery, return-to-briefing, fullscreen, and collapsible HUD actions.
- Marine chart with vessel heading, mission route, distance, bearing, timing, and progress.
- Player-plotted free-navigation routes with up to eight safe-water marks, undo, clear, and restart.
- World-space route beacons and animated navigation guidance.
- Physical navigation gates, delivery cargo, rescue pods, and emergency relay objectives.
- Scenario checkpoints that recreate the authoritative six-degree vessel at the latest safe recovery location.
- Mission success/failure rules and score calculation from time, damage, contacts, and recoveries.
- Persistent best score, best time, attempts, completions, failures, and last-run records per scenario.
- First-launch onboarding, contextual keyboard/touch hints, persistent settings, reduced motion, higher contrast, and interface scaling.

## Simulation architecture

`sim/core/FixedStepRunner.ts` owns the accumulator-based simulation clock:

- Physics advances at `1 / 60` second per step.
- A bounded substep budget prevents a suspended tab from causing a catch-up spiral.
- Excess backlog is recorded as dropped simulation time for diagnostics.
- Rendering interpolates between previous and current physics transforms.
- Ocean and buoy visuals use interpolated simulation time, keeping water rendering aligned with vessel sampling.

`sim/core/SixDofBody.ts` owns the authoritative vessel transform and momentum state:

- Linear velocity represents world-space center-of-mass velocity.
- Angular velocity is exposed in world space for velocity-at-point calculations.
- Torque is transformed into principal body axes for inertia and damping.
- Euler's rigid-body equation includes the gyroscopic `ω × Iω` term.
- An offset center of mass is integrated without making the visual origin orbit during pitch and roll.
- Contact impulses produce linear and angular changes through configured mass and inertia.
- A queued safe-spawn transform allows checkpoint recovery to create a fresh authoritative body without mutating an old simulation in place.
- Finite-state guards and vessel-specific angular limits prevent one invalid force from poisoning later steps.

`sim/vessels/DistributedHullForces.ts` evaluates water interaction:

- Each vessel defines four longitudinal hull stations with port, center, and starboard samples.
- Every sample follows the complete vessel quaternion and queries the Gerstner surface rendered by the ocean shader.
- Buoyancy is proportional to local immersion and damped by point velocity.
- Forward and lateral resistance use local point velocity relative to current, so angular motion naturally creates damping torque.
- Forces are applied at their real world positions, producing heave, pitch, roll, and yaw rather than assigning visual angles.

`sim/collision/RapierCollisionWorld.ts` owns contact geometry and manifold generation:

- The custom marine body remains authoritative for motion and hydrodynamics.
- A kinematic three-piece rounded hull proxy follows each completed physics step.
- Procedural terrain uses a fixed triangle mesh; navigation obstacles use updated sphere colliders.
- Rapier manifold normals, penetration, and contact points become bounded normal and tangential impulses on `SixDofBody`.
- Terrain and obstacle impacts are classified independently for response, audio, damage, and automated validation.

`sim/scenarios/` and the product stores own gameplay without changing vessel dynamics:

- `ScenarioCatalog.ts` defines environment presets, routes, mission tasks, and checkpoints.
- `ScenarioRoute.ts` moves authored routes, entities, and plotted marks onto safe navigable water.
- `ScenarioDirector.tsx` evaluates progression, tasks, checkpoints, success/failure, scoring, and records.
- `useNavigationPlanner.ts` owns temporary player-plotted routes.
- `useScenarioHistory.ts` owns persistent per-scenario records.

Simulation-affecting randomness comes from `sim/core/SeededRandom.ts`, not the browser frame loop. Vessel configuration and hull-force layouts live in `sim/vessels/VesselConfig.ts` rather than being scattered through React components.

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

This runs lint, TypeScript checking, the production build, and the full dependency audit. GitHub Actions adds deterministic physics calibration, desktop/mobile/Rapier smoke testing, session/navigation flows, onboarding/settings coverage, and gameplay-system tests.

## Controls

- `W` / `S` or arrow up/down: forward and reverse throttle
- `A` / `D` or arrow left/right: steer
- Hold `R` while nearly stopped with throttle cut: repair
- `Escape`: pause or resume
- `C`: cycle camera
- `Home`: recover the vessel at the latest safe checkpoint
- `H`: hide or show the instrument HUD
- `F`: toggle fullscreen
- `O`: open settings
- On touch devices, use the on-screen throttle, steering, repair, camera, pause, and chart controls
- In free-navigation mode, tap or click the chart to plot safe-water marks

## Rendering quality and diagnostics

The quality selector is available in production and its selection is remembered. Auto mode chooses a conservative initial tier from the device profile, then adapts using measured rendering performance.

Append `?debug=1` to enable FPS metrics and Calm/Storm benchmark controls. Append `?debug=0` to clear the remembered debug preference.

The browser suites validate held keyboard and touch input, finite and bounded vessel state, Rapier contact response, responsive layouts, launch/session actions, navigation values, mission outcomes, onboarding, settings persistence, free-route plotting, checkpoint recovery, and scenario-record persistence.

## Project structure

- `app/`: App Router entry point and global styles
- `components/`: simulation rendering, product shell, HUD, mission systems, weather, wake, and diagnostics
- `components/boat/`: vessel audio and visual-damage subsystems
- `sim/core/`: fixed-step timing, deterministic randomness, six-degree integration, and safe body spawning
- `sim/vessels/`: typed vessel configuration and distributed marine-force models
- `sim/collision/`: Rapier geometry, contact manifolds, and custom-body collision response
- `sim/scenarios/`: mission definitions plus route/entity/checkpoint water-safety resolution
- `lib/`: deterministic terrain and water helpers
- `store/`: simulation controls, product settings, navigation planning, records, telemetry, and shared high-frequency values
- `scripts/`: browser smoke, gameplay, onboarding/settings, and deterministic calibration probes
- `.github/workflows/`: repository validation and production browser testing

## Remaining Phase 3 work

The next product slice covers gamepad support, remappable keyboard controls, configurable touch controls, independent audio channels, configurable HUD modules, remaining mobile polish, and final integrated-GPU/physical-device review.

## License

MIT. See [LICENSE](LICENSE).
