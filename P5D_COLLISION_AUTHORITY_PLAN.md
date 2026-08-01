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

- [x] Separate velocity integration from pose integration in `SixDofBody`.
- [x] Preserve the existing `integrate(dt)` compatibility path by composing both phases.
- [x] Add safe external-state import for position, quaternion, center-of-mass velocity, and angular velocity.
- [x] Expose current center of mass and principal inertia needed by the contact solver.
- [x] Add deterministic regressions proving split and composed integration remain equivalent without contacts.

### Dynamic Rapier authority

- [x] Replace the position-based kinematic vessel proxy with a dynamic rigid body.
- [x] Disable collider-contributed mass and provide explicit vessel mass properties.
- [x] Synchronize pre-step pose and marine-integrated velocities before each Rapier step.
- [x] Read the solved pose and velocities back after each step.
- [x] Remove manual normal impulses, heuristic friction impulses, shared impulse budgets, and translation-only penetration correction.
- [x] Use actual solver contact impulses and all manifold contacts for diagnostics.
- [x] Preserve CCD, soft-CCD prediction, solver iterations, contact skins, fixture behavior, and collision telemetry.

### Contact quality

- [ ] Verify bow, stern, side, grounding, glancing, and head-on response use effective angular mass.
- [x] Keep friction bounded by Rapier material coefficients rather than independent hand-tuned impulse caps.
- [x] Ensure contact outcome no longer depends on vessel-collider iteration order within the deterministic test tolerance.
- [ ] Keep residual overlap bounded without directly translating the custom body.
- [ ] Preserve damage and flooding decisions using measured closing speed and solved impulse.

### Validation

- [x] Add no-contact trajectory parity tests.
- [x] Add off-center impulse and angular-response tests.
- [x] Add contact-order invariance coverage.
- [x] Add momentum and kinetic-energy sanity bounds for direct and glancing contacts.
- [ ] Preserve all 20 vessel calibration scenarios.
- [ ] Preserve desktop, mobile, product-experience, and Chromium/Firefox/WebKit release gates.
- [ ] Record before/after collision metrics and any deliberate envelope changes.

## Current checkpoint

The cleaned dynamic-authority implementation is published through `203f77262bf870ed6319ae6ee449df2631ce2076`. The present documentation commit is the exact-head trigger for the permanent repository matrix.

The custom rigid body performs the anisotropic marine velocity update without advancing pose. Rapier receives that state on an explicit-mass dynamic body, advances the pose once, resolves its complete contact set, and returns the authoritative transform and velocities. The previous single-contact normal impulse, independent friction impulse, shared impulse budget, and direct position correction have been removed.

`npm run test:physics` now combines the existing marine regressions with a dedicated Rapier collision-authority suite. The new suite validates actual solver impulses, off-center rotation, inertia-sensitive angular response, compound-collider order invariance, bounded residual penetration, and non-increasing kinetic energy within defined solver tolerance. Physics regressions, zero-warning lint, TypeScript checking, the production build, dependency audit, and source-invariant checks passed before the branch cleanup. No one-use workflow or encoded transfer payload remains in the PR.

The permanent 20-scenario vessel, visual smoke, product experience, and cross-browser release matrices are now the active gate before the remaining contact-quality items are marked complete.

## Implementation sequence

### 5D.1 — Split integration foundation

Refactor `SixDofBody` into velocity and pose phases, add external solver state import, and prove the no-contact trajectory is unchanged.

### 5D.2 — Dynamic collision projection

Create an explicit-mass dynamic Rapier vessel, advance pose and solve contacts in Rapier, import the result, and delete the manual impulse/correction code.

### 5D.3 — Contact diagnostics and robustness

Measure actual solver impulses across every contact, validate off-center impacts, remove order-dependent bookkeeping, and tighten recovery behavior.

### 5D.4 — Calibration and release validation

Run the complete permanent matrix, document measured changes, promote the PR, and merge only after exact-head sign-off.

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
