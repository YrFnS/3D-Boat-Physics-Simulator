# 3D Boat Physics Simulator

An interactive browser-based marine simulation built with Next.js, React Three Fiber, Three.js, and Rapier. It combines procedural water, severe weather, deterministic six-degree vessel motion, route-based missions, free navigation, damage, flooding, recovery, and a responsive instrument suite in a local-first web application.

> **Project status:** `v1.0.0` release candidate. The Phase 5A–5D physics roadmap is complete: core reference-frame correctness, sectional hydrostatics and flooding, power-limited propulsion and maneuvering, and dynamic Rapier collision authority. Repository-owned automated validation is required on every exact candidate head. Representative physical-GPU and touch-device measurements remain the final manual release sign-off before merging the release branch into `main`.

## Features

### Marine simulation

- Deterministic 60 Hz vessel simulation separated from display refresh rate.
- Interpolated rendering between completed physics states.
- Seeded simulation-only randomness for repeatable hazards and damage.
- Six-degree-of-freedom motion with world-space center-of-mass and angular velocity.
- Principal-axis inertia, added mass, gyroscopic torque, and axis-specific damping.
- Procedural Gerstner water with matching CPU position, normal, orbital velocity, and acceleration sampling.
- Twelve vessel-specific hydrostatic cells with displaced-volume Archimedes support and a dynamic center of buoyancy.
- Local water-relative surge, sway, heave, roll, pitch, and yaw resistance.
- Localized bow, midship, and stern slamming from water-entry speed, wetting rate, area, and deadrise.
- Typed flood compartments that retain water mass, shift the center of mass, add inertia, reduce reserve buoyancy, and support passive or active pumping.
- Winter deck loading represented as physical mass above the center of gravity.
- Vessel-specific engine RPM, shaft power, gearbox ratios, propeller advance ratio, thrust, torque, cavitation, ventilation, and signed prop wash.
- Local-flow rudder lift and drag with ahead, astern, stall, damage, and low-speed prop-wash behavior.
- Dynamic Rapier pose and collision authority with explicit vessel mass, center of mass, principal inertia, friction, restitution, CCD, and multi-contact response.
- Impact-driven hull, engine, rudder, and compartment-flooding damage.
- Typed and calibrated trawler and speedboat configurations.

### World and rendering

- GPU-generated wake field, rain, hurricane clouds, lightning, and storm effects.
- Procedural islands, seasonal terrain, navigation buoys, ice, a whirlpool, and weather-gated tornado hazards.
- Adaptive Low, Medium, High, and Ultra quality tiers covering ocean, terrain, weather, wake, and shadows.
- Recoverable WebGL context handling and unsupported-device guidance.
- Optional FPS, draw-call, triangle, short diagnostic, and physical-release benchmark tools.

### Product and gameplay

- Responsive launch briefing with scenario and vessel selection.
- Open Water, Harbor Training, Storm Passage, and Winter Rescue missions.
- Chase, helm, orbit, and cinematic cameras with one authoritative camera owner.
- Pause, resume, restart, safe recovery, return-to-briefing, fullscreen, and collapsible HUD actions.
- Marine chart with vessel heading, mission route, distance, bearing, timing, and progress.
- Player-plotted free-navigation routes with up to eight safe-water marks, undo, clear, and restart.
- World-space route beacons and animated navigation guidance.
- Physical navigation gates, delivery cargo, rescue pods, and emergency relay objectives.
- Scenario checkpoints that recreate the authoritative vessel at the latest safe recovery location.
- Mission completion, failure, and scoring from time, damage, contacts, and recoveries.
- Persistent best score, best time, attempts, completions, failures, and last-run records per scenario.
- First-launch onboarding, keyboard and touch hints, persistent settings, reduced motion, higher contrast, and interface scaling.

## Simulation architecture

### Fixed-step clock

`sim/core/FixedStepRunner.ts` owns the accumulator-based simulation clock:

- Physics advances at `1 / 60` second per step.
- The accepted display-frame delta and substep budget are aligned so valid frame time is not silently lost.
- Suspended-tab backlog is bounded and reported as dropped simulation time.
- Rendering interpolates between previous and current physics transforms.
- Ocean and buoy visuals use interpolated simulation time, keeping water rendering aligned with vessel sampling.

### Six-degree marine body

`sim/core/SixDofBody.ts` owns marine momentum state and the custom anisotropic force integration:

- Linear velocity represents world-space center-of-mass velocity.
- Angular velocity is exposed in world space for point-velocity calculations.
- Force, torque, mass, added mass, inertia, and damping are evaluated in principal body axes.
- Euler's rigid-body equation includes the gyroscopic `ω × Iω` term.
- Velocity and pose integration are separate phases.
- Collision-free fixtures can use the composed custom integrator.
- The live collision path imports the transform and velocities solved by dynamic Rapier.
- Full last-valid-state rollback prevents one invalid force or external state from poisoning later steps.
- Vessel-specific motion limits are enforced before and after collision resolution.

### Water and hydrostatics

`sim/water/WaterSurface.ts` and `sim/water/GerstnerWater.ts` own the CPU water-state contract:

- Every query returns surface position, unit normal, orbital velocity, and acceleration.
- Horizontal Gerstner displacement is inverted so physics samples the world-space surface rendered by the ocean shader.
- Shoreline dampening, winter ice suppression, and whirlpool deformation remain aligned with the GPU surface.
- Deterministic finite-difference tests verify normal and velocity consistency.

`sim/vessels/SectionalHydrostatics.ts` evaluates hull-water interaction:

- Each vessel defines four longitudinal stations split into port, center, and starboard hydrostatic cells.
- Local immersion produces displaced volume and Archimedes force instead of a tuned vertical spring.
- Active cells derive the dynamic center of buoyancy, local water exposure, and average water velocity.
- Point velocity relative to local orbital water velocity drives damping, resistance, and wave-excitation loads.
- Local air-to-water entry creates bounded slamming forces and compartment-specific damage.

`sim/vessels/FloodingModel.ts` owns internal water and loading state:

- Hull impacts and severe slams create deterministic compartment breaches.
- Retained water contributes physical mass, center-of-mass shift, and parallel-axis inertia.
- Flooded sealed volume loses reserve buoyancy independently by compartment, allowing asymmetric heel and trim.
- Passive pumps and the stopped-vessel repair control remove water over time.
- Winter deck loading adds mass above the center of gravity instead of changing draft through an offset shortcut.

### Propulsion and maneuvering

`sim/vessels/PropulsionSystem.ts` owns the drivetrain and appendage flow model:

- Throttle commands a governed engine rather than directly multiplying a fixed force.
- Engine idle, rated, and maximum RPM interact with rated power, torque response, damage, and driveline efficiency.
- Propeller advance speed is sampled relative to local water at the configured shaft point.
- Advance ratio, thrust coefficient, torque coefficient, absorbed shaft power, cavitation, ventilation, and prop wash are signed and bounded.
- Ahead and astern behavior use separate gearbox and propeller response.
- Rudder force comes from actual local vessel flow, ambient water, and signed prop wash.
- Lift, drag, angle of attack, stall, damage, and low-speed steering authority remain continuous and finite.
- Propeller and rudder loads are applied at configured physical points, preserving trim, roll, and yaw torque.

### Collision authority

`sim/collision/RapierCollisionWorld.ts` owns collision pose advancement and contact resolution:

- `SixDofBody` first updates velocity from marine forces without advancing pose.
- A dynamic Rapier body receives the pre-step pose, updated velocities, physical mass, center of mass, and principal inertia.
- Rapier advances the vessel pose exactly once and resolves the complete contact set.
- Compound vessel colliders contribute no extra mass; explicit vessel mass properties remain authoritative.
- Friction, restitution, CCD, contact prediction, angular response, and penetration recovery come from Rapier's solver.
- Solved position, quaternion, linear velocity, and angular velocity are imported back into the marine body.
- Impulse telemetry uses Rapier geometric contacts, while solver-contact world points provide closing-speed diagnostics.
- Centered, off-center, higher-inertia, energy-bound, and compound-collider-order regressions protect the contact architecture.
- Procedural terrain, calibration fixtures, and navigation obstacles are classified independently for telemetry, audio, damage, and flooding.

### Gameplay and presentation

`sim/scenarios/` and the product stores own gameplay without changing vessel dynamics:

- `ScenarioCatalog.ts` defines environments, routes, mission tasks, and checkpoints.
- `ScenarioRoute.ts` moves authored routes, entities, and plotted marks onto safe navigable water.
- `ScenarioDirector.tsx` evaluates progression, tasks, checkpoints, completion, failure, scoring, and records.
- `useNavigationPlanner.ts` owns temporary player-plotted routes.
- `useScenarioHistory.ts` owns persistent per-scenario records.

`components/CameraRig.tsx` is the sole camera authority for chase, helm, orbit, and cinematic modes. Vessel rendering no longer contains a competing camera tracker.

Simulation-affecting randomness comes from `sim/core/SeededRandom.ts`, not the browser frame loop. Vessel geometry, hydrostatic cells, flood compartments, drivetrain data, hydrodynamic coefficients, and loading definitions live in `sim/vessels/VesselConfig.ts` rather than being scattered through React components.

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

This runs deterministic marine and collision-authority tests, zero-warning lint, TypeScript checking, the production build, and the full dependency audit. GitHub Actions additionally runs:

- the complete 20-scenario trawler and speedboat calibration matrix, including ahead and astern maneuvering, grounding, glancing contact, and direct impact;
- desktop, mobile, and real collision-impulse smoke tests;
- session, navigation, gameplay, onboarding, settings, recovery, and persistence flows;
- Chromium, Firefox, and WebKit production-browser validation;
- cross-engine deterministic metric comparison;
- unsupported-WebGL, context-loss, and corrupted-storage recovery;
- screenshot entropy, variation, dynamic-range, and dominant-color checks that reject blank or camera-obstructed 3D output;
- a production smoke test of physical-device benchmark metadata capture and JSON export.

Software-rendered CI FPS is retained only as diagnostic data. Use the physical benchmark mode on representative hardware for release performance decisions.

## Controls

- `W` / `S` or arrow up/down: forward and reverse throttle
- `A` / `D` or arrow left/right: steer
- Hold `R` while nearly stopped with throttle cut: repair and pump
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

## Release candidate status

The `v1.0.0` release branch is designed to reject source, dependency, runtime, layout, accessibility, physics, calibration, recovery, benchmark-harness, and obvious 3D-rendering regressions before merge.

The remaining manual sign-off is tracked in `RELEASE_CHECKLIST.md`:

- Calm and Storm on the target desktop GPU at High quality;
- Calm and Storm on integrated graphics at Medium quality;
- portrait Calm and landscape Storm on a physical touch device using Auto quality;
- wake visibility, LOD transitions, storm readability, camera comfort, HUD scale, touch reachability, and thermal behavior;
- keyboard, mouse, touch, and any available gamepad observations.

Deployment-provider quotas are tracked separately from source-code validation. Repository-owned production builds and browser workflows remain the source-validation authority.

## Known limitations

- Physical GPU frame-rate and thermal claims require the manual benchmark matrix; CI uses software rendering for correctness and regression diagnosis only.
- The current coefficients are calibrated against documented simulator envelopes, not manufacturer sea-trial data or CFD. Independent real-vessel calibration is a future optional phase.
- One player vessel is simulated at a time.
- Navigation obstacles and calibration fixtures are static; vessel-to-vessel and dynamic floating-body collisions are not implemented.
- The vessel contact shape uses a tuned compound rounded-hull proxy rather than imported convex decomposition from production meshes.
- Multiple engines, controllable-pitch propellers, waterjets, azimuth drives, bow thrusters, fuel, thermal systems, exhaust, and electrical systems are outside the current scope.
- The application is local-first and does not include multiplayer or a server-side progression service.

## Project structure

- `app/`: App Router entry point and global styles
- `components/`: simulation rendering, product shell, HUD, mission systems, weather, wake, camera, recovery, benchmark, and diagnostics
- `components/boat/`: vessel audio and visual-damage subsystems
- `sim/core/`: fixed-step timing, deterministic randomness, split six-degree integration, and safe body spawning
- `sim/water/`: CPU water position, normal, velocity, and acceleration sampling
- `sim/vessels/`: vessel geometry, sectional hydrostatics, flooding, added-mass damping, environmental forces, propulsion, rudder flow, and loading
- `sim/collision/`: dynamic Rapier vessel authority, world colliders, solver telemetry, and collision regression support
- `sim/scenarios/`: mission definitions plus route, entity, and checkpoint water-safety resolution
- `lib/`: deterministic terrain and general helpers
- `store/`: controls, settings, navigation planning, records, telemetry, and shared high-frequency state
- `scripts/`: physics, collision, smoke, gameplay, settings, calibration, cross-browser, screenshot-integrity, and benchmark probes
- `.github/workflows/`: source validation, production-browser testing, physics calibration, product flows, and release validation

## License

MIT. See [LICENSE](LICENSE).
