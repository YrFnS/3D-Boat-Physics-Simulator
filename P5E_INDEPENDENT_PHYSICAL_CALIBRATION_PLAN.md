# Phase 5E — Independent Physical Vessel Calibration

Phase 5E separates **simulator regression envelopes** from **external physical evidence**. The v1.0 release branch remains unchanged; this work starts from the exact v1.0 candidate on a separate branch.

## Why this phase exists

The simulator now has coherent water, hydrostatic, propulsion, maneuvering, flooding, and collision systems. Its existing 20-scenario suite is excellent for detecting regressions, but most acceptance ranges were created during simulator development. Passing them proves consistency, not agreement with a particular real vessel.

Phase 5E introduces an evidence-first calibration layer so a metric can only be called physically validated when its target, units, uncertainty, operating condition, and source are recorded.

## Calibration principles

1. **Never overwrite regression evidence.** The current v1.0 envelopes remain the product-stability gate.
2. **Never present simulator output as external truth.** Internal baseline profiles are explicitly non-certifying.
3. **Keep provenance with every target.** Manufacturer data, sea trials, model tests, standards, derived estimates, and simulator baselines are distinguishable.
4. **Represent uncertainty.** Targets use nominal, minimum, and maximum values rather than a single magic number.
5. **Separate method references from vessel evidence.** A manoeuvring standard can define how to measure a turn without proving the correct target for a four-metre craft.
6. **Tune bounded parameter groups, not isolated constants.** Any later optimizer must preserve physical signs, limits, and cross-scenario behavior.
7. **Report coverage as well as score.** Missing evidence must remain visible instead of being silently ignored.

## Reference methodology

The initial framework follows the measurement and traceability principles used by recognized marine-performance work:

- [IMO MSC.137(76), Standards for Ship Manoeuvrability](https://www.imo.org/en/knowledgecentre/indexofimoresolutions/pages/msc-2000-03.aspx) is a manoeuvring-method reference. Its ship-level limits are not automatically applied to the simulator's small craft.
- [ITTC Recommended Procedures archive](https://ittc.info/downloads/archive-of-recommended-procedures/) is the preferred source for trial, model-test, uncertainty, resistance, propulsion, manoeuvring, and seakeeping procedures.
- [ITTC manoeuvring benchmark repository](https://ittc.info/benchmark-repository/manoeuvring-predictions/) provides independent validation datasets and examples of reproducible comparison.

## Scope

### 5E.1 — Evidence and scoring foundation

- [x] Create a typed physical-reference profile contract.
- [x] Require source provenance, evidence class, confidence, operating conditions, units, and uncertainty bounds.
- [x] Add deterministic validation and scoring functions.
- [x] Distinguish certifying evidence from a simulator-only baseline.
- [x] Add provisional trawler and speedboat baseline profiles to exercise the pipeline without claiming real-world validation.
- [x] Append physical-comparison output to the existing calibration report.
- [x] Add permanent contract tests.

### 5E.2 — Reference-vessel data acquisition

- [ ] Select one traceable displacement workboat/trawler reference and one planing speedboat reference.
- [ ] Record length, beam, displacement, draft, center of gravity, power, gearbox, propeller, and rudder data.
- [ ] Record loading condition, water density, wind, waves, depth, trim, and uncertainty for every trial result.
- [ ] Store original source identifiers and a normalized machine-readable profile.
- [ ] Reject release-grade status when required source fields are missing.

### 5E.3 — Independent trial scenarios

- [ ] Add static draft and displacement checks against external data.
- [ ] Add roll-decay period, damping ratio, and optional pitch-decay checks.
- [ ] Add acceleration and speed-versus-time curves, not only final speed.
- [ ] Add stopping time, stopping distance, and heading change after engine cutoff.
- [ ] Add turning advance, transfer, tactical diameter, steady radius, speed loss, and heel.
- [ ] Add ahead and astern trials with signed water-relative speed.
- [ ] Add head, following, and beam-sea response cases when reference data exists.

### 5E.4 — Sensitivity and bounded calibration

- [ ] Compute finite-difference sensitivity of each measured metric to each tunable parameter group.
- [ ] Identify unobservable and over-coupled parameters before optimization.
- [ ] Add bounded multi-objective fitting with holdout scenarios.
- [ ] Preserve signs, monotonic relationships, energy bounds, and all v1.0 regression gates.
- [ ] Produce before/after parameter diffs and metric residuals.

### 5E.5 — Validation status and release integration

- [ ] Require minimum evidence coverage before a vessel profile can become `evidence-backed`.
- [ ] Require holdout metrics that were not used for tuning.
- [ ] Publish uncertainty-aware physical scores and residual plots.
- [ ] Keep v1.0 gameplay envelopes and physical-reference results side by side.
- [ ] Document which claims are measured, derived, estimated, or still unknown.

## Evidence classes

| Class | Meaning | Can certify physical agreement? |
|---|---|---|
| `sea-trial` | Measured full-scale vessel result | Yes |
| `model-test` | Controlled scale-model result with scaling method | Yes, with stated limitations |
| `manufacturer` | Published vessel or propulsion specification | Yes for the stated quantity |
| `classification` | Regulatory or class-approved vessel data | Yes for the stated quantity |
| `standard` | Measurement or acceptance methodology | Method only; not vessel-specific proof |
| `derived` | Calculation from cited inputs and formula | Only with uncertainty and source inputs |
| `simulator-baseline` | Existing simulator result or envelope | No |

## Initial implementation boundary

The first checkpoint intentionally does **not** retune vessel coefficients. It builds the data contract, validation, scoring, coverage, and reporting path. The included profiles are marked `simulator-baseline`, so they can prove the tooling works but can never produce an evidence-backed certification.

## Exit criteria

Phase 5E is complete when:

1. At least one displacement vessel and one planing vessel have traceable external reference profiles.
2. Geometry, loading condition, propulsion, static equilibrium, acceleration, stopping, and turning evidence have explicit uncertainty.
3. Calibration and holdout scenarios are separated.
4. Every tuned parameter remains bounded and physically signed.
5. The v1.0 regression matrix remains green.
6. Physical scores report both error and evidence coverage.
7. Documentation makes no realism claim beyond the available evidence.
