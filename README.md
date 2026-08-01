# 3D Boat Physics Simulator

An interactive browser-based marine simulation built with Next.js, React Three Fiber, Three.js, and Rapier. The project combines procedural water, severe weather, calibrated six-degree vessel handling, route-based missions, free navigation, damage, recovery, and a responsive instrument suite in a local-first web application.

> **Project status:** Phase 5B validation candidate. The fixed-step, reference-frame, collision, gameplay, rendering, and release foundations are complete. The current branch adds local water-state sampling, sectional Archimedes support, added mass, compartment flooding, and localized slamming while preserving the existing browser and calibration gates. Representative physical-GPU and touch-device measurements remain part of the final release sign-off.

## Features

### Marine simulation

- Procedural Gerstner-wave ocean with matching CPU position, normal, orbital-velocity, and acceleration sampling.
- Deterministic 60 Hz vessel simulation separated from display refresh rate.
- Interpolated vessel rendering between completed physics states.
- Seeded simulation-only randomness for repeatable damage and hazard behavior.
- Six-degree-of-freedom vessel motion with world-space linear and angular velocity.
- Center-of-mass-correct transform integration and principal-axis inertia.
- Twelve vessel-specific hydrostatic cells with sectional displaced-volume support and a dynamic center of buoyancy.
- Body-axis added mass plus linear and quadratic surge, sway, heave, roll, pitch, and yaw damping.
- Typed flood compartments that add retained water mass, shift the center of mass, reduce reserve buoyancy, and support passive or active pumping.
- Localized bow, midship, and stern slamming based on water-relative entry velocity, wetting rate, area, and deadrise.
- Point-applied propeller, rudder, wind, planing, hydrostatic, damping, wave-excitation, and environmental forces.
- Rapier terrain and obstacle manifolds with compound vessel hull proxies.
- Off-center collision impulses, bounded penetration correction, contact friction, and impact-driven damage.
- Typed and calibrated trawler and speedboat configurations.

### World and rendering

- GPU-generated wake field, rain, hurricane clouds, lightning, and storm effects.
- Procedural islands, seasonal terrain, navigation buoys, ice, a whirlpool, and weather-gated tornado hazards.
- Adaptive Low, Medium, High, and Ultra quality tiers covering ocean, terrain, weather, wake, and shadow budgets.
- Recoverable WebGL context handling and unsupported-device guidance.
- Optional FPS, draw-call, triangle, quick diagnostic, and physical-release benchmark tools.

### Product and gameplay

- Responsive launch briefing with scenario and vessel selection.
- Open Water, Harbor Training, Storm Passage, and Winter Rescue missions.
- Chase, helm, orbit, and cinematic cameras with one authoritative camera owner.
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
- Contact impulses produce linear and angular changes through configured physical mass, added mass, inertia, and added inertia.
- A queued safe-spawn transform allows checkpoint recovery to create a fresh authoritative body without mutating an old simulation in place.
- Finite-state guards and vessel-specific angular limits prevent one invalid force from poisoning later steps.

`sim/water/WaterSurface.ts` and `sim/water/GerstnerWater.ts` own the CPU water-state contract:

- Every query returns surface position, unit normal, orbital velocity, and acceleration.
- Horizontal Gerstner displacement is inverted so physics samples the same world-space surface rendered by the ocean shader.
- Shoreline dampening, winter ice suppression, and whirlpool deformation remain aligned with the GPU surface.
- Deterministic finite-difference tests verify vertical velocity and normal consistency.

`sim/vessels/SectionalHydrostatics.ts` evaluates hull-water interaction:

- Each vessel defines four longitudinal stations split into port, center, and starboard hydrostatic cells.
- Local immersion produces displaced volume and Archimedes force instead of a tuned vertical spring.
- The active cells derive a dynamic center of buoyancy, local water exposure, and average water velocity.
- Point velocity relative to local orbital water velocity drives heave damping, surge/sway resistance, and wave-excitation loads.
- Local air-to-water entry produces bounded slamming forces and compartment-specific damage.

`sim/vessels/FloodingModel.ts` owns internal water and loading state:

- Hull impacts and severe slams create deterministic compartment breaches.
- Retained flood water contributes physical mass, center-of-mass shift, and parallel-axis inertia.
- Flooded sealed volume loses reserve buoyancy independently by compartment, allowing asymmetric heel and trim.
- Passive pumps and the stopped-vessel repair control remove water over time rather than instantly restoring global draft.
- Winter deck loading adds mass above the center of gravity instead of changing draft through a sign-adjusted offset.

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

`components/CameraRig.tsx` is the sole camera authority for chase, helm, orbit, and cinematic modes. Vessel rendering no longer contains a competing camera tracker.

Simulation-affecting randomness comes from `sim/core/SeededRandom.ts`, not the browser frame loop. Vessel geometry, hydrodynamic coefficients, flood compartments, and winter loads live in `sim/vessels/VesselConfig.ts` rather than being scattered through React components.

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

This runs deterministic physics-correctness tests, lint, TypeScript checking, the production build, and the full dependency audit. GitHub Actions additionally runs:

- deterministic water-state, hydrostatic, added-mass, flooding, slamming, trawler, and speedboat calibration;
- desktop, mobile, and Rapier-contact smoke tests;
- session, navigation, gameplay, onboarding, settings, and persistence flows;
- Chromium, Firefox, and WebKit production-browser validation;
- cross-engine deterministic metric comparison;
- WebGL unsupported/context-loss and corrupted-storage recovery;
- screenshot entropy, variation, dynamic-range, and dominant-color checks that reject blank or camera-obstructed 3D output;
- a production smoke of the physical-device benchmark, metadata capture, and JSON export path.

Software-rendered CI FPS is retained only as diagnostic data. Use the dedicated physical benchmark mode on real hardware for release performance decisions.

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

Append `?debug=1` to enable FPS metrics and short Calm/Storm diagnostic controls. Append `?debug=0` to clear the remembered debug preference.

Append `?benchmark=1` to enter the responsive physical-release harness. Each Calm or Storm run performs a 10-second warmup followed by a 30-second measurement while recording:

- average, minimum, and fifth-percentile FPS;
- average and maximum frame time;
- draw calls and triangle count;
- manual or Auto quality behavior and quality changes;
- first-half versus second-half FPS drift;
- browser, operating system, WebGL GPU renderer, CPU concurrency, reported memory, touch capability, viewport, DPR, and orientation.

A hidden tab invalidates the run. A second-half FPS drop of 15% or more is flagged for thermal or power-mode review. The latest 24 results are kept locally and can be exported as JSON or copied directly as Markdown rows for `RELEASE_CHECKLIST.md`.

The browser suites validate held keyboard and touch input, finite and bounded vessel state, displaced volume, physical mass, flooding telemetry, center of buoyancy, local water velocity, slam bounds, Rapier contact response, responsive layouts, launch/session actions, navigation values, mission outcomes, onboarding, settings persistence, free-route plotting, checkpoint recovery, scenario-record persistence, cross-browser camera presentation, and the physical benchmark export flow.

## Release candidate status

The automated release gate is designed to reject source, runtime, layout, accessibility, physics, calibration, recovery, benchmark-harness, and obvious 3D-rendering regressions before merge.

The remaining manual sign-off is tracked in `RELEASE_CHECKLIST.md`:

- Calm and Storm benchmarks on the target desktop GPU;
- the same benchmark matrix on integrated graphics;
- a physical touch device in portrait and landscape;
- camera comfort, HUD scale, wake visibility, storm readability, and thermal behavior;
- keyboard, mouse, touch, and any available gamepad observations.

Deferred optional product expansion includes remappable keyboard controls, configurable touch layout/sensitivity, full gamepad mapping and vibration, independent audio-channel controls, configurable HUD modules, and additional river/harbor content. These are not blockers for the current agreed release scope.

Deployment-provider quotas are tracked separately from source-code validation. Repository-owned production builds and browser workflows remain the validation authority.

## Project structure

- `app/`: App Router entry point and global styles
- `components/`: simulation rendering, product shell, HUD, mission systems, weather, wake, camera, recovery, benchmark, and diagnostics
- `components/boat/`: vessel audio and visual-damage subsystems
- `sim/core/`: fixed-step timing, deterministic randomness, six-degree integration, and safe body spawning
- `sim/water/`: CPU water-state contracts and Gerstner position/normal/velocity/acceleration sampling
- `sim/vessels/`: typed vessel geometry, sectional hydrostatics, added-mass damping, environmental forces, and compartment flooding
- `sim/collision/`: Rapier geometry, contact manifolds, and custom-body collision response
- `sim/scenarios/`: mission definitions plus route/entity/checkpoint water-safety resolution
- `lib/`: deterministic terrain and general helpers
- `store/`: simulation controls, product settings, navigation planning, records, telemetry, and shared high-frequency values
- `scripts/`: smoke, gameplay, onboarding/settings, calibration, cross-browser release, screenshot-integrity, and physical-benchmark probes
- `.github/workflows/`: source validation, production-browser testing, physics calibration, product flows, and release validation

## License

MIT. See [LICENSE](LICENSE).
