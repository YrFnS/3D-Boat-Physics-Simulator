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

- [x] Verify centered, off-center, grounding, glancing, and head-on response use effective angular mass.
- [x] Keep friction bounded by Rapier material coefficients rather than independent hand-tuned impulse caps.
- [x] Ensure contact outcome no longer depends on compound-collider iteration order within the defined tolerance.
- [x] Keep residual overlap bounded without directly translating the custom body.
- [x] Preserve damage and flooding decisions using measured closing speed and solved impulse.

### Validation

- [x] Add no-contact trajectory parity tests.
- [x] Add off-center impulse and angular-response tests.
- [x] Add contact-order invariance coverage.
- [x] Add kinetic-energy sanity bounds for centered and off-center impact fixtures.
- [x] Preserve all 20 vessel calibration scenarios.
- [x] Preserve desktop, mobile, product-experience, and Chromium/Firefox/WebKit release gates.
- [x] Record before/after collision metrics without widening the established collision envelopes.

## Final implementation checkpoint

The dynamic-authority implementation was introduced at `040b8ba332d4a9cc6a7a4e8e4dfaae824a2bcfae`, hardened at `a797b52cfe7d49cb121da2223216d549f9cc8243`, and cleaned at `203f77262bf870ed6319ae6ee449df2631ce2076`.

The custom rigid body now performs the anisotropic marine velocity update without advancing pose. Rapier receives that state on an explicit-mass dynamic body, advances the pose once, solves its complete contact set, and returns the authoritative transform and velocities. The previous single-contact normal impulse, independent friction impulse, shared impulse budget, and direct position correction no longer exist.

`npm run test:physics` combines the existing marine regressions with a dedicated Rapier collision-authority suite. Physics regressions, zero-warning lint, TypeScript checking, the production build, dependency audit, and source-invariant checks pass with no one-use workflow or encoded transfer payload remaining in the PR.

### Direct solver regression results

The permanent collision-authority regression verifies solver contacts, actual normal and tangent impulses, effective angular mass, kinetic-energy behavior, and compound-collider ordering.

| Scenario | Peak solver impulse | Final angular speed | Final kinetic energy |
|---|---:|---:|---:|
| Centered impact | 11,232.001 Ns | 0.000005 rad/s | 77.760 J |
| Off-center impact | 10,165.953 Ns | 1.649763 rad/s | 5,170.514 J |
| Four-times inertia | 10,593.130 Ns | 0.973258 rad/s | 3,262.077 J |
| Reversed collider order | 10,165.953 Ns | 1.649763 rad/s | 5,170.514 J |

The initial kinetic energy is 48,600 J in every fixture. The off-center impact creates a material yaw response, quadrupling principal inertia reduces angular speed by roughly 41%, and reversing compound-collider creation order produces zero measured difference in final position, linear velocity, angular velocity, or peak impulse.

### Browser collision results

The dynamic authority preserves every established collision envelope. Compared with the Phase 5C manual response, direct head-on fixtures resolve in five solver-contact samples instead of more than one hundred repeated manual contacts, while maximum reported residual penetration remains zero in grounding, glancing, and impact scenarios.

| Scenario | Contacts | Peak closing speed | Peak solver impulse | Peak angular speed |
|---|---:|---:|---:|---:|
| Trawler grounding | 1,720 | 2.35662 m/s | 477.156 Ns | 0.38254 rad/s |
| Trawler glancing | 952 | 3.33409 m/s | 2,457.469 Ns | 0.86107 rad/s |
| Trawler head-on | 5 | 8.36211 m/s | 5,620.222 Ns | 0.43124 rad/s |
| Speedboat grounding | 2,493 | 3.25322 m/s | 1,119.983 Ns | 0.71451 rad/s |
| Speedboat glancing | 1,089 | 4.68291 m/s | 1,952.515 Ns | 0.88346 rad/s |
| Speedboat head-on | 5 | 13.93420 m/s | 5,808.377 Ns | 0.11522 rad/s |

### Final impulse-index correction

The calibrated runtime correction at `13ebbc4ffe3a0bece9379fc5b220d00b7e9ad88b` reads solved normal and tangent impulses from Rapier's geometric-contact indices and retains solver-contact indices only for world-space point and closing-speed diagnostics. The complete source validation, all 20 vessel calibration scenarios, and desktop/mobile/collision smoke passed before that commit was published. No collision acceptance envelope was changed.

This documentation commit changes no runtime source. It is the human-authored exact-head trigger for the permanent CI, calibration, visual, product-experience, and Chromium/Firefox/WebKit release matrix.

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
