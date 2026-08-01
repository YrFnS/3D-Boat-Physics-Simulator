# Phase 5D — Collision Authority

Phase 5D removes the remaining hand-tuned contact impulse and translation-correction path. The validated custom marine solver remains responsible for anisotropic added mass, hydrodynamic damping, buoyancy, propulsion, flooding, and environmental loads, while a dynamic Rapier rigid body becomes authoritative for pose advancement and collision response.

## Goal

Make obstacle, shoreline, and grounding response emerge from Rapier's multi-contact rigid-body solver with real effective mass, angular inertia, friction, restitution, continuous collision detection, and penetration recovery—without double-integrating the vessel or weakening the Phase 5A–5C marine model.

## Architecture decision

Rapier cannot directly represent the vessel's axis-dependent translational added mass. Therefore Phase 5D uses a split integration pipeline:

1. `SixDofBody` evaluates marine forces in vessel principal axes and integrates velocity only.
2. Rapier receives the pre-step pose, updated center-of-mass velocity, angular velocity, physical mass, center of mass, and principal inertia.
3. Rapier advances the pose once, solves all contact manifolds, and returns the authoritative transform and velocities.
4. `SixDofBody` imports that authoritative state for the next marine-force step and rendering.
5. Scenarios that intentionally bypass collision geometry retain the deterministic custom pose integrator.

This preserves the existing hydrodynamic equations while replacing the custom collision solver rather than layering a second integration pass on top of it.

## Scope

### Split six-degree integration

- [ ] Separate velocity integration from pose integration in `SixDofBody`.
- [ ] Preserve the existing `integrate(dt)` compatibility path by composing both phases.
- [ ] Add safe external-state import for position, quaternion, center-of-mass velocity, and angular velocity.
- [ ] Expose current center of mass and principal inertia needed by the contact solver.
- [ ] Add deterministic regressions proving split and composed integration remain equivalent without contacts.

### Dynamic Rapier authority

- [ ] Replace the position-based kinematic vessel proxy with a dynamic rigid body.
- [ ] Disable collider-contributed mass and provide explicit vessel mass properties.
- [ ] Synchronize pre-step pose and marine-integrated velocities before each Rapier step.
- [ ] Read the solved pose and velocities back after each step.
- [ ] Remove manual normal impulses, heuristic friction impulses, shared impulse budgets, and translation-only penetration correction.
- [ ] Use actual solver contact impulses and all manifold contacts for diagnostics.
- [ ] Preserve CCD, soft-CCD prediction, solver iterations, contact skins, fixture behavior, and collision telemetry.

### Contact quality

- [ ] Verify bow, stern, side, grounding, glancing, and head-on response use effective angular mass.
- [ ] Keep friction bounded by Rapier material coefficients rather than independent hand-tuned impulse caps.
- [ ] Ensure contact outcome no longer depends on vessel-collider iteration order.
- [ ] Keep residual overlap bounded without directly translating the custom body.
- [ ] Preserve damage and flooding decisions using measured closing speed and solved impulse.

### Validation

- [ ] Add no-contact trajectory parity tests.
- [ ] Add off-center impulse and angular-response tests.
- [ ] Add contact-order invariance coverage.
- [ ] Add momentum/energy sanity bounds for glancing and head-on fixtures.
- [ ] Preserve all 20 vessel calibration scenarios.
- [ ] Preserve desktop, mobile, product-experience, and Chromium/Firefox/WebKit release gates.
- [ ] Record before/after collision metrics and any deliberate envelope changes.

## Implementation sequence

### 5D.1 — Split integration foundation

Refactor `SixDofBody` into velocity and pose phases, add external solver state import, and prove the no-contact trajectory is unchanged.

### 5D.2 — Dynamic collision projection

Create an explicit-mass dynamic Rapier vessel, advance pose and solve contacts in Rapier, import the result, and delete the manual impulse/correction code.

### 5D.3 — Contact diagnostics and robustness

Measure actual solver impulses across every contact, validate off-center impacts, remove order-dependent bookkeeping, and tighten recovery behavior.

### 5D.4 — Calibration and release validation

Run the complete permanent matrix, document measured changes, remove temporary tooling, promote the PR, and merge only after exact-head sign-off.

## Exit criteria

Phase 5D is complete when:

1. The vessel pose is advanced exactly once per fixed step.
2. Rapier is authoritative for contact impulses, friction, restitution, and penetration recovery.
3. The custom manual contact impulse and position-correction path no longer exists.
4. Marine force behavior remains deterministic and unchanged in no-contact scenarios.
5. Off-center impacts produce inertia-aware translation and rotation.
6. Collision outcomes are independent of compound-collider iteration order within defined tolerance.
7. Collision telemetry reports actual solver impulse and bounded penetration.
8. All 20 calibration scenarios and every permanent browser/release gate pass.

## Deferred

- Multiple simultaneously simulated vessels.
- Dynamic floating obstacles and vessel-to-vessel collisions.
- Imported convex-decomposition collision hulls from production boat meshes.
- Breakable scenery and deformable hull contact.
- Full coupling of anisotropic added mass directly into a general-purpose rigid-body solver.
