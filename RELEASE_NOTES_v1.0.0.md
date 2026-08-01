# 3D Boat Physics Simulator v1.0.0

`v1.0.0` is the first stable-release candidate for the browser-based 3D Boat Physics Simulator. It consolidates the performance, product, rendering, gameplay, marine-physics, propulsion, flooding, and collision-authority work completed across Phases 1–5D.

## Highlights

### Coherent marine simulation

- Deterministic 60 Hz simulation with render interpolation and bounded frame-backlog handling.
- Six-degree vessel motion using principal-axis mass, inertia, added mass, damping, gyroscopic torque, and finite-state recovery.
- CPU water samples aligned with the rendered Gerstner surface, including position, normal, orbital velocity, and acceleration.
- Sectional displaced-volume buoyancy with a dynamic center of buoyancy.
- Local water-relative damping, wave excitation, planing, and section-based slamming.
- Typed flood compartments with retained water mass, center-of-mass shift, added inertia, reserve-buoyancy loss, and pumping.
- Winter loading represented as physical mass above the center of gravity.

### Power-limited propulsion and maneuvering

- Governed engine RPM, rated shaft power, torque response, gearbox ratios, and driveline efficiency.
- Water-relative propeller advance ratio, thrust, torque, cavitation, ventilation, and signed prop wash.
- Ahead and astern propulsion with separate signed behavior.
- Local-flow rudder lift and drag, angle of attack, stall, damage response, and low-speed prop-wash steering.
- Permanent forward and reverse acceleration, stopping, and turning calibration coverage.

### Dynamic collision authority

- Dynamic Rapier vessel body with explicit physical mass, center of mass, and principal inertia.
- Rapier-owned pose advancement, multi-contact impulses, friction, restitution, CCD, and penetration recovery.
- Removal of the former custom normal impulse, friction impulse, shared impulse budget, and direct position-correction path.
- Actual solved normal and tangent impulse telemetry.
- Centered, off-center, higher-inertia, energy-bound, and compound-collider-order regression coverage.

### Product and rendering

- Responsive launch briefing, missions, free navigation, route plotting, checkpoints, recovery, scoring, and persistent history.
- Chase, helm, orbit, and cinematic cameras under one camera authority.
- Adaptive Low, Medium, High, Ultra, and Auto rendering quality.
- Procedural ocean, wake, terrain, islands, rain, clouds, lightning, winter ice, whirlpool, and tornado hazards.
- Keyboard and touch controls, onboarding, reduced motion, high contrast, interface scaling, fullscreen, and recoverable WebGL errors.
- Built-in physical-device benchmark mode using `?benchmark=1`.

## Validation

The release branch contains permanent gates for:

- deterministic marine and collision-authority regressions;
- zero-warning lint, TypeScript checking, production build, and dependency audit;
- 20 trawler and speedboat calibration scenarios;
- desktop, mobile, and real collision-impulse smoke tests;
- gameplay, onboarding, settings, recovery, navigation, and persistence flows;
- Chromium, Firefox, and WebKit release validation;
- cross-engine calibration comparison;
- unsupported-WebGL, context-loss, and corrupted-storage recovery;
- screenshot integrity and physical-benchmark export validation.

Exact-head automated results and the remaining physical-hardware matrix are recorded in PR #12 and `RELEASE_CHECKLIST.md`.

## Manual release sign-off

Before the release branch is merged into `main` and tagged, run Calm and Storm through `?benchmark=1` on:

- the target desktop GPU at High quality;
- integrated graphics at Medium quality;
- a physical phone or tablet in portrait and landscape using Auto quality.

Record FPS, frame time, GPU renderer, quality changes, thermal drift, wake visibility, LOD behavior, storm readability, camera comfort, HUD readability, and touch reachability. Export the JSON evidence and attach or link it from PR #12.

## Known limitations

- Physical GPU performance and thermal behavior are not inferred from software-rendered CI.
- Vessel coefficients are calibrated to simulator envelopes rather than manufacturer sea-trial datasets or CFD.
- One player vessel is simulated at a time.
- Dynamic vessel-to-vessel and floating-object collisions are not included.
- Vessel contacts use compound rounded-hull proxies rather than imported convex decomposition.
- Multiple engines, controllable-pitch propellers, waterjets, azimuth drives, bow thrusters, fuel, exhaust, electrical systems, multiplayer, and server-side progression are outside this release.

## Upgrade notes

This release remains local-first and requires no database migration. Install the committed dependency graph with:

```bash
npm ci
```

Then validate the exact checkout with:

```bash
npm run validate
```
