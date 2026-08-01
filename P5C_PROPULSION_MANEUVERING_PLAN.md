# Phase 5C — Propulsion and Maneuvering Physics

Phase 5C replaces the remaining force-only engine and minimum-bite steering approximations with a coherent browser-scale propulsion train. It builds on the validated Phase 5B water-state, sectional hydrostatics, flooding, and slamming foundation while leaving collision authority unchanged.

## Goal

Make acceleration, maximum speed, reverse handling, prop wash, steering authority, and power demand emerge from engine, gearbox, propeller, rudder, and local water-flow state rather than a fixed thrust force and absolute-speed steering factors.

## Scope

### Engine and driveline

- [ ] Add vessel-specific idle, rated, and maximum engine RPM.
- [ ] Add rated shaft power, torque-curve shape, gearbox ratio, driveline efficiency, and rotational response.
- [ ] Model throttle as an engine-command target rather than a direct force multiplier.
- [ ] Keep engine RPM, shaft RPM, delivered power, and load finite and deterministic.
- [ ] Reduce available power from engine damage without creating discontinuities.

### Propeller model

- [ ] Add propeller diameter, pitch ratio, blade count, wake fraction, thrust deduction, and signed rotation direction.
- [ ] Compute advance speed from local water-relative flow at the propeller.
- [ ] Derive advance ratio, thrust coefficient, torque coefficient, thrust, shaft torque, and absorbed power.
- [ ] Preserve correct ahead and astern signs.
- [ ] Limit output through engine power, propeller loading, cavitation, and ventilation factors.
- [ ] Apply propeller force at the configured shaft position so trim and yaw torque remain physical.

### Rudder and maneuvering

- [ ] Sample local inflow at the rudder from vessel motion, ambient water, and signed prop wash.
- [ ] Replace the fixed minimum steering bite with lift and drag based on angle of attack and local flow speed.
- [ ] Support correct ahead, astern, and near-zero-speed steering behavior.
- [ ] Add stall saturation and bounded rudder side force.
- [ ] Apply lift and drag at the configured rudder center of pressure.
- [ ] Keep damaged-rudder authority continuous and bounded.

### Telemetry and presentation

- [ ] Expose engine RPM, shaft RPM, shaft power, propeller thrust, advance ratio, cavitation, ventilation, prop wash, and rudder load.
- [ ] Keep existing HUD and audio integrations compatible while moving their source to physical drivetrain state.
- [ ] Preserve deterministic calibration exports and browser diagnostics.

### Calibration and validation

- [ ] Add pure regressions for power limits, signed advance ratio, ahead/astern thrust, zero-flow rudder behavior, prop-wash steering, cavitation, ventilation, and damage response.
- [ ] Add reverse acceleration and reverse-turn calibration coverage.
- [ ] Preserve still-water equilibrium, flooding, collision, visual, product, and release gates.
- [ ] Record any intentional maneuvering changes with measured before/after results.
- [ ] Do not widen existing acceptance envelopes merely to hide a changed model.

## Implementation sequence

### 5C.1 — Typed drivetrain and propeller math

Add vessel drivetrain configuration, pure engine/propeller calculations, telemetry types, and deterministic tests without changing the live force path.

### 5C.2 — Authoritative propulsion force

Replace fixed thrust with shaft-power-limited propeller thrust at the configured propeller point. Preserve current controls and validate straight-line acceleration, speed, stopping, and finite-state behavior.

### 5C.3 — Rudder inflow and signed maneuvering

Replace minimum-bite steering with local-flow lift/drag, signed prop wash, reverse behavior, stall saturation, and bounded rudder loads.

### 5C.4 — Calibration and release validation

Add reverse fixtures, record final metrics, run every permanent repository gate, remove compatibility code, and finalize the PR only after all checks pass.

## Exit criteria

Phase 5C is complete when:

1. Maximum speed is power-limited rather than the result of a fixed unbounded force.
2. Propeller thrust and torque respond to signed water-relative advance speed.
3. Ahead and astern commands produce correctly signed thrust and shaft state.
4. A stopped vessel without prop wash has negligible rudder authority.
5. Prop wash creates low-speed steering authority with the correct sign.
6. Cavitation and ventilation reduce thrust smoothly under their intended conditions.
7. Engine and rudder damage reduce output continuously without invalid state.
8. Straight-line, stopping, turning, reverse, collision, visual, product, and cross-browser release checks pass with documented metrics.

## Deferred

- Multiple engines, controllable-pitch propellers, waterjets, azimuth drives, and bow thrusters.
- A dynamic Rapier vessel or complete custom effective-mass contact solver.
- Imported manufacturer propeller open-water curves.
- Full engine thermal, fuel, exhaust, and electrical simulation.
- CFD-resolved hull-propeller-rudder interaction and free-surface ventilation sheets.
