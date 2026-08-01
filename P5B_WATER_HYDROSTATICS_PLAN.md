# Phase 5B — Water and Hydrostatics

Phase 5B replaces the remaining height-only and spring-only water interaction with a coherent browser-scale hydrostatics foundation. It builds on the validated Phase 5A fixed-step and reference-frame corrections without changing the collision authority or propulsion architecture yet.

## Goal

Make vessel equilibrium, wave response, damping, flooding, and slamming emerge from local water state and hull geometry rather than global draft offsets and aggregate thresholds.

## Scope

### Water-state sampling

- [ ] Return surface position, normal, velocity, and vertical acceleration from the CPU water sampler.
- [ ] Keep CPU samples aligned with the Gerstner surface rendered by the ocean shader.
- [ ] Include shoreline, ice, and whirlpool deformation in the sampled surface.
- [ ] Use local water velocity for every submerged hull section.
- [ ] Add deterministic finite-difference tests for surface velocity and normal consistency.

### Section-based hydrostatics

- [ ] Replace the point-spring buoyancy calculation with weighted hull sections.
- [ ] Estimate displaced volume per section from local immersion and hull cross-section geometry.
- [ ] Apply Archimedes buoyancy using water density and gravity.
- [ ] Derive a dynamic center of buoyancy from the active sections.
- [ ] Preserve full six-degree force and torque application through `SixDofBody`.
- [ ] Keep the model inexpensive enough for the existing 60 Hz browser simulation.

### Added mass and coupled damping

- [ ] Introduce vessel-specific surge, sway, heave, roll, pitch, and yaw added-mass coefficients.
- [ ] Evaluate linear and quadratic damping in vessel body axes.
- [ ] Apply local water-relative velocity rather than world velocity.
- [ ] Avoid double-counting drag already represented by section forces.
- [ ] Add finite-state and energy-dissipation regression tests.

### Flooding foundation

- [ ] Add typed vessel compartments with local position, capacity, and flood susceptibility.
- [ ] Convert hull damage and water exposure into deterministic compartment flooding.
- [ ] Add flooded-water mass to effective vessel mass and center of mass.
- [ ] Reduce reserve buoyancy through displaced internal volume rather than a global draft-sign adjustment.
- [ ] Add passive pumping and active repair compatibility without instant global recovery.
- [ ] Expose aggregate flooding telemetry for HUD and validation.

### Section-based slamming

- [ ] Detect local air-to-water entry at individual bow, midship, and stern sections.
- [ ] Base slam load on relative entry velocity, immersion growth, deadrise, and section area.
- [ ] Apply slam impulses at the impacted section.
- [ ] Route localized slam severity into hull, engine, and rudder damage.
- [ ] Remove the aggregate submerged-ratio slam threshold.

### Calibration and validation

- [ ] Add static-equilibrium tests for both vessels from multiple initial heights.
- [ ] Add heel and pitch restoring tests.
- [ ] Add still-water decay tests for heave, roll, and pitch.
- [ ] Add following-current and moving-wave tests using local water velocity.
- [ ] Add progressive flooding, asymmetric flooding, pump-down, and loss-of-equilibrium tests.
- [ ] Add bow-versus-stern slam localization tests.
- [ ] Preserve the existing physics-correctness, collision, visual, product, and release gates.
- [ ] Record any intentional calibration changes with measured before/after metrics.

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

- Engine torque, propeller advance ratio, cavitation, ventilation, and signed prop wash.
- A dynamic Rapier vessel or a complete custom effective-mass contact solver.
- Imported production hull meshes and offline hydrostatic preprocessing.
- Full CFD, spray-sheet, and breaking-wave simulation.
