# Simulator Stabilization Plan

This branch stabilizes the cumulative simulator from `integration/all-branches-20260804` before any further calibration, visual expansion, or release promotion.

## P0A — Exact-head validation

- [x] Create one cumulative stabilization branch from the latest integration head.
- [x] Open one draft pull request back into `integration/all-branches-20260804`.
- [x] Require CI, product experience, visual smoke, physics calibration, and release validation on the exact stabilization head.
- [x] Treat previous Phase 4 release evidence as historical rather than evidence for this branch.
- [x] Synchronize the WebGL context-loss probe with explicit recovery-listener readiness so release validation cannot race application initialization.

## P0B — Runtime authority

- [x] Prevent all vessel, flooding, collision, mission, and environmental frame callbacks from advancing while paused.
- [x] Keep the render loop stopped while the authoritative collision runtime is unavailable.
- [x] Block launch, controls, mission time, and reset recovery until the matching Rapier world is ready.
- [x] Present a visible recovery path when collision initialization stalls.
- [x] Keep the menu intentionally static: demand renders may refresh a preview, but vessel, world, weather, hazard, wake, and decorative clocks remain frozen.

## P0C — World consistency

- [x] Define one heading-to-world-vector convention for wind, rain, snow drift, waves, flags, audio, current, and navigation.
- [x] Make wave direction respond to wind direction without changing the default 90° calibrated sea state.
- [x] Remove moving whirlpool state from cached terrain and collision generation.
- [x] Share immutable terrain and hazard geometry between rendering, shoreline dampening, route safety, and Rapier collision.

## P0D — Collision lifecycle and scoring

- [x] Replace per-step contact-point accumulation with compound-collider contact-start events grouped by external terrain or obstacle.
- [x] Count one sustained grounding/contact as one gameplay collision, including brief solver dropouts and hull-piece handoffs.
- [x] Preserve raw manifold counts, impact speed, impulse, penetration, and class telemetry independently for damage and diagnostics.
- [x] Add regressions for sustained contact, release grace, compound-hull handoff, full separation, repeated impact, fixture classification, and vessel-generation reset.

## P1 — Mission and damage fairness

- [x] Drive mission time, travelled distance, and maximum speed from fixed simulation steps, preserving time across recovery while rejecting teleport distance.
- [x] Lock standard mission presets, require an explicit assisted-mode transition for custom conditions, and exclude assisted attempts from standard records.
- [x] Keep assisted scores informational and track assisted attempts separately without replacing standard best score, best time, best hull health, or standard attempt totals.
- [ ] Replace generic radius completion with typed gate, relay, cargo, and rescue interactions.
- [ ] Remove unexplained normal-operation hull wear.
- [ ] Rebalance field repair and account for repair use in scoring.

## P2 — Architecture and performance

- [ ] Split vessel runtime, physics, collision, damage, telemetry, audio, and rendering responsibilities out of `Boat.tsx`.
- [ ] Version obstacle data and synchronize Rapier colliders only when obstacle state changes.
- [ ] Align visible terrain detail and collision detail near the vessel.
- [ ] Complete the physical desktop, integrated-GPU, and touch-device benchmark matrix.

## Release rule

No release checklist item may be marked complete from an older commit. Every automated and physical result must identify the exact tested stabilization head.
