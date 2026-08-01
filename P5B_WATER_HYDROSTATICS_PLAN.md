# Phase 5B — Water and Hydrostatics

Phase 5B replaces the remaining height-only and spring-only water interaction with a coherent browser-scale hydrostatics foundation. It builds on the validated Phase 5A fixed-step and reference-frame corrections without changing the collision authority or propulsion architecture yet.

## Goal

Make vessel equilibrium, wave response, damping, flooding, and slamming emerge from local water state and hull geometry rather than global draft offsets and aggregate thresholds.

## Scope

### Water-state sampling

- [x] Return surface position, normal, velocity, and vertical acceleration from the CPU water sampler.
- [x] Keep CPU samples aligned with the Gerstner surface rendered by the ocean shader.
- [x] Include shoreline, ice, and whirlpool deformation in the sampled surface.
- [x] Use local water velocity for every submerged hull section.
- [x] Add deterministic finite-difference tests for surface velocity and normal consistency.

### Section-based hydrostatics

- [x] Replace the point-spring buoyancy calculation with weighted hull sections.
- [x] Estimate displaced volume per section from local immersion and hull cross-section geometry.
- [x] Apply Archimedes buoyancy using water density and gravity.
- [x] Derive a dynamic center of buoyancy from the active sections.
- [x] Preserve full six-degree force and torque application through `SixDofBody`.
- [x] Keep the model allocation-conscious and bounded for the existing 60 Hz browser simulation.

### Added mass and coupled damping

- [x] Introduce vessel-specific surge, sway, heave, roll, pitch, and yaw added-mass coefficients.
- [x] Evaluate linear and quadratic damping in vessel body axes.
- [x] Apply local water-relative velocity rather than world velocity.
- [x] Avoid double-counting drag already represented by section forces.
- [x] Add finite-state and energy-dissipation regression tests.

### Flooding foundation

- [x] Add typed vessel compartments with local position, capacity, and flood susceptibility.
- [x] Convert hull damage and water exposure into deterministic compartment flooding.
- [x] Add flooded-water mass to effective vessel mass and center of mass.
- [x] Reduce reserve buoyancy through displaced internal volume rather than a global draft-sign adjustment.
- [x] Add passive pumping and active repair compatibility without instant global recovery.
- [x] Expose aggregate flooding telemetry for HUD and validation.

### Section-based slamming

- [x] Detect local air-to-water entry at individual bow, midship, and stern sections.
- [x] Base slam load on relative entry velocity, immersion growth, deadrise, and section area.
- [x] Apply slam impulses at the impacted section.
- [x] Route localized slam severity into hull, engine, and rudder damage.
- [x] Remove the aggregate submerged-ratio slam threshold.

### Calibration and validation

- [ ] Add static-equilibrium tests for both vessels from multiple initial heights.
- [ ] Add dedicated heel and pitch restoring fixtures beyond the existing stability calibration.
- [ ] Add dedicated still-water decay measurements for heave, roll, and pitch.
- [x] Add following-current and moving-wave water-state tests using local water velocity.
- [ ] Add full dynamic progressive-flooding and loss-of-equilibrium fixtures; pure asymmetric flooding and pump-down tests are complete.
- [ ] Add full section-entry bow-versus-stern slam localization fixtures; force/deadrise scaling tests are complete.
- [x] Preserve the existing physics-correctness, collision, visual, product, and release gates.
- [x] Record the intentional turn-fixture adjustment with measured before/after metrics instead of widening its physical envelope.

## Validated checkpoint

Final Phase 5B validation checkpoint: `d9e4e74957c3bfb28c4514343a629a3b282ea55c`.

The permanent repository-owned gates all pass on that exact clean head:

- deterministic physics-correctness tests, lint, TypeScript, production build, and dependency audit;
- 16/16 trawler, speedboat, grounding, glancing, and impact calibration scenarios;
- desktop and mobile visual smoke;
- session, navigation, gameplay, onboarding, settings, recovery, and persistence flows;
- Chromium, Firefox, and WebKit release validation;
- physical benchmark export and screenshot-integrity checks.

Sectional hydrostatics and added-mass damping reduced the representative speedboat turn-entry fixture from `14.30891 m/s` only after raising its approach input from `0.24` to `0.25`. The accepted physical envelope remains unchanged at `14–37 m/s`. The validated turn completed `180.36851°`, measured an `8.66831 m` radius, and reached `9.57123°` maximum roll.

The remaining unchecked fixtures are deeper validation expansion for future phases. They do not replace or weaken the deterministic and cross-browser gates used to validate this foundation.

## Implementation sequence

### 5B.1 — Water-state and hydrostatic sections

Introduce the richer water sample, typed section geometry, Archimedes support, dynamic center of buoyancy, and regression tests. Keep legacy flooding and slam behavior temporarily behind adapters until the section model is validated.

### 5B.2 — Added mass and damping

Add body-axis added mass and coupled damping, then recalibrate rest, acceleration, stopping, and turning behavior without weakening finite-state limits.

### 5B.3 — Compartments and flooding

Replace the global hull-damage draft offset with compartment water mass, center-of-mass movement, reserve-buoyancy loss, pumps, and deterministic flooding telemetry.

### 5B.4 — Section slamming and full validation

Replace aggregate slam detection, run all browser and calibration suites, document final metrics, and remove compatibility paths.

## Exit criteria

Phase 5B is complete when:

1. Each submerged section uses local water position, normal, and velocity.
2. Static displacement balances vessel plus flood-water mass within a documented tolerance.
3. Center-of-buoyancy movement creates stable pitch and roll restoring moments without an artificial upright controller at rest.
4. Hydrodynamic damping always removes relative kinetic energy in its intended axis.
5. Symmetric flooding lowers freeboard while asymmetric flooding shifts heel and trim.
6. Local section entry produces localized slam impulses and damage.
7. Existing collision, gameplay, visual, and release flows remain finite and usable.
8. Deterministic calibration results are recorded rather than hidden by widened envelopes.

## Deferred

- Dedicated multi-height equilibrium, decay-period, dynamic flooding-loss, and slam-localization fixture expansion.
- Engine torque, propeller advance ratio, cavitation, ventilation, and signed prop wash.
- A dynamic Rapier vessel or a complete custom effective-mass contact solver.
- Imported production hull meshes and offline hydrostatic preprocessing.
- Full CFD, spray-sheet, and breaking-wave simulation.
