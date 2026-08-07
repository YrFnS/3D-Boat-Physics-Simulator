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
- [x] Keep the desktop navigation chart clear of scored-environment controls so the assisted-mode transition remains physically accessible.
- [x] Replace generic entity-radius completion with forward gate crossings, timed relay holds, and type-specific cargo/rescue pickup and delivery zones.
- [x] Use the same resolved inbound heading and gate width for rendered posts and crossing detection, with regressions for reverse crossings and crossings outside the posts.
- [x] Reset partial interaction state on recovery and expose task progress and speed/hold guidance in the navigation HUD.
- [x] Remove passive hull wear from sustained planing and passive rudder wear from ordinary hydrodynamic steering loads.
- [x] Route slamming, terrain, obstacle, environmental, overheating, and machinery-flooding health loss through one explicit typed damage policy with permanent regressions.
- [x] Separate bilge pumping from structural repair, cap emergency engine/rudder recovery, preserve condition across recovery, and include repair time/restoration in mission scoring and results.
- [x] Attribute repair use during free navigation to the active mission budget and clear active-repair state immediately on release, pause, or mission completion.

## P2 — Architecture and performance

- [x] Split vessel runtime, physics, collision, damage, telemetry, audio, and rendering responsibilities out of `Boat.tsx`.
  - [x] Extract component condition, engine thermal/flooding damage, and field-repair mutation into `VesselConditionRuntime`.
  - [x] Extract Rapier contact-summary response, impact damage, breach selection, collision telemetry, and impact-audio orchestration into `VesselCollisionRuntime`.
  - [x] Extract sectional hydrostatics, propulsion, steering, wind, planing, roll-stability, and environmental-force orchestration into `VesselDynamicsRuntime`.
  - [x] Extract fixed-step telemetry, calibration publication, shared engineering state, and deterministic 10 Hz UI publication into `VesselTelemetryRuntime`.
  - [x] Extract render interpolation, flag and rudder presentation, cached damage visuals, and render-frame audio coordination into `VesselPresentationRuntime`.
  - [x] Move trawler and speedboat procedural meshes into dedicated render components with no simulation authority.
  - [x] Protect the extracted vessel architecture with focused condition, dynamics, telemetry, presentation, render-model, collision lifecycle, collision runtime, collision architecture, and vessel architecture gates.
- [x] Version obstacle data and synchronize only changed Rapier collider slots, skipping unchanged fixed steps entirely.
  - [x] Deduplicate repeated changes to the same obstacle before each Rapier synchronization.
  - [x] Ignore sub-threshold buoy motion and retain a bounded revision history with safe full-sync recovery for new or stale collision worlds.
  - [x] Remove direct raw-array obstacle mutation and protect the authority boundary with `test:obstacle-sync`.
- [x] Align visible terrain, Rapier collision, route safety, buoy placement, and shoreline dampening through one canonical indexed heightfield.
  - [x] Remove quality-dependent terrain topology so Low through Ultra render the same shoreline triangles used by collision.
  - [x] Cache one immutable 129 × 129 point grid—128 segments with 23.4375-metre cells—and share its vertex and index arrays between Three.js and Rapier.
  - [x] Sample the exact indexed-triangle interpolation for CPU water, route-safety, buoy-placement, and shoreline decisions.
  - [x] Generate shoreline dampening from the same canonical height array and prohibit direct procedural terrain reads outside the terrain authority.
  - [x] Keep winter snow visual-only through material shading rather than displacing the physical terrain surface.
  - [x] Protect the authority boundary with `test:terrain-heightfield` in every physics validation run.
- [ ] Complete the physical desktop, integrated-GPU, and touch-device benchmark matrix.

## Exact-head evidence

The current validated commit and its five workflow results are recorded in PR #20 after the matrix finishes. This file deliberately avoids embedding a moving branch-head SHA.

## Release rule

No release checklist item may be marked complete from an older commit. Every automated and physical result must identify the exact tested stabilization head.
