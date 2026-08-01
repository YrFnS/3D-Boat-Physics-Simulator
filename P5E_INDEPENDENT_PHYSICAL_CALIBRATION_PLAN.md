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
5. **Separate method references from vessel evidence.** A manoeuvring standard can define how to measure a turn without proving the correct target for a small craft.
6. **Tune bounded parameter groups, not isolated constants.** Any later optimizer must preserve physical signs, limits, and cross-scenario behavior.
7. **Report coverage as well as score.** Missing evidence must remain visible instead of being silently ignored.
8. **Do not mutate the v1 vessels in place.** Evidence-oriented reference configurations will be separate from the stable gameplay configurations.

## Reference methodology

The framework follows the measurement and traceability principles used by recognized marine-performance work:

- [IMO MSC.137(76), Standards for Ship Manoeuvrability](https://www.imo.org/en/knowledgecentre/indexofimoresolutions/pages/msc-2000-03.aspx) is a manoeuvring-method reference. Its ship-level limits are not automatically applied to the simulator's small craft.
- [ITTC Recommended Procedures archive](https://ittc.info/downloads/archive-of-recommended-procedures/) is the preferred source for trial, model-test, uncertainty, resistance, propulsion, manoeuvring, and seakeeping procedures.
- [ITTC manoeuvring benchmark repository](https://ittc.info/benchmark-repository/manoeuvring-predictions/) provides independent validation datasets and examples of reproducible comparison.

## Scope

### 5E.1 — Evidence and scoring foundation

- [x] Create a typed physical-reference profile contract.
- [x] Require source provenance, evidence class, confidence, operating conditions, units, and uncertainty bounds.
- [x] Add deterministic validation and uncertainty-aware scoring functions.
- [x] Distinguish comparison, certification eligibility, and certified status.
- [x] Distinguish certifying evidence from a simulator-only baseline.
- [x] Add non-certifying v1 trawler and speedboat baseline profiles.
- [x] Append physical-comparison output to the existing calibration report.
- [x] Add permanent profile, scoring, coverage, and certification contract tests.

### 5E.2 — Reference-vessel data acquisition

- [x] Select one traceable displacement workboat reference: **De Wit Tomboy 26**.
- [x] Select one traceable planing speedboat reference: **Axopar 22 Spyder**.
- [x] Record manufacturer-published length, beam, weight, draft, power, hull type, and available speed quantities.
- [x] Store original source identifiers, access dates, evidence class, confidence, uncertainty notes, and normalized machine-readable profiles.
- [x] Compare external quantities with deterministic measurements of the current v1 vessel configurations.
- [x] Reject evidence-backed and certified status while required vessel or trial evidence is missing.
- [ ] Acquire matched loading condition, engine mass, fuel, payload, trim, and water-density data.
- [ ] Acquire center-of-gravity, gearbox, propeller, rudder, and shaft-arrangement data.
- [ ] Acquire wind, waves, depth, instrumentation, repeatability, and uncertainty for every performance trial.
- [ ] Replace provisional manufacturer-only profiles with full evidence-backed profiles.

### 5E.3 — Independent trial scenarios

- [x] Add configuration measurements for length, beam, mass, draft, power, propeller diameter, water density, and planing classification.
- [x] Add quantity-specific manufacturer comparison without allowing missing trials to disappear from coverage.
- [ ] Add matched static draft and displacement checks against external loading data.
- [ ] Add a Tomboy 26 bollard-pull trial contract and measured simulator trial.
- [ ] Add an Axopar 22 matched 27-knot cruise-condition trial.
- [ ] Add roll-decay period, damping ratio, and optional pitch-decay checks.
- [ ] Add acceleration and speed-versus-time curves, not only final speed.
- [ ] Add stopping time, stopping distance, and heading change after engine cutoff.
- [ ] Add turning advance, transfer, tactical diameter, steady radius, speed loss, and heel.
- [ ] Add ahead and astern trials with signed water-relative speed.
- [ ] Add head, following, and beam-sea response cases when reference data exists.

### 5E.4 — Sensitivity and bounded calibration

- [ ] Add separate calibration-only Tomboy 26 and Axopar 22 configuration records.
- [ ] Compute finite-difference sensitivity of each measured metric to each tunable parameter group.
- [ ] Identify unobservable and over-coupled parameters before optimization.
- [ ] Add bounded multi-objective fitting with holdout scenarios.
- [ ] Preserve signs, monotonic relationships, energy bounds, and all v1.0 regression gates.
- [ ] Produce before/after parameter diffs and metric residuals.

### 5E.5 — Validation status and release integration

- [x] Require minimum measurement and evidence coverage before certification eligibility.
- [x] Support calibration, holdout, and informational target roles.
- [x] Keep v1 gameplay envelopes and physical-reference results side by side.
- [x] Document which quantities are manufacturer-published, simulator-measured, estimated, or still missing.
- [ ] Add independent holdout trials that were not used for fitting.
- [ ] Publish uncertainty-aware physical scores, residual tables, and residual plots.
- [ ] Promote a profile to `evidence-backed` only after the required external trial evidence exists.

## Reference-selection checkpoint

The first external comparison is recorded in [`P5E_REFERENCE_SELECTION.md`](P5E_REFERENCE_SELECTION.md).

The current v1 configurations remain unchanged and all 20 simulator regression scenarios pass. Their measured comparison against the selected manufacturer profiles is intentionally poor:

| Profile | Score | Measurement coverage | External evidence coverage | Certified |
|---|---:|---:|---:|---:|
| Trawler v1 simulator baseline | 100.00 | 100% | 0% | No |
| Speedboat v1 simulator baseline | 100.00 | 100% | 0% | No |
| De Wit Tomboy 26 provisional | 0.00 | 92% | 100% | No |
| Axopar 22 Spyder provisional | 21.74 | 92% | 100% | No |

The Tomboy comparison exposes a vessel-scale, displacement, power, draft, and speed mismatch. The Axopar comparison confirms only the planing classification and that the current speed is below the published 45-knot ceiling; geometry, mass, draft, and power do not match. Missing bollard-pull and matched cruise trials remain visible as unmeasured holdouts.

These results are evidence that separate reference configurations are required. They are not a reason to force the stable v1 gameplay vessels into unrelated manufacturer envelopes.

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

## Current implementation boundary

Phase 5E now includes the scoring foundation and the first traceable manufacturer profiles. It still does **not** retune vessel coefficients or claim full-vessel validation.

Manufacturer data can support the exact quantities stated by the source, but it does not provide the matched loading, center of gravity, appendage geometry, acceleration curves, stopping trials, turning trials, roll decay, or sea-state response required for a complete calibration. Both selected profiles therefore remain `provisional`, certification-ineligible, and uncertified.

## Exit criteria

Phase 5E is complete when:

1. At least one displacement vessel and one planing vessel have traceable external reference profiles.
2. Geometry, loading condition, propulsion, static equilibrium, acceleration, stopping, and turning evidence have explicit uncertainty.
3. Calibration and independent holdout scenarios are separated.
4. Every tuned parameter remains bounded and physically signed.
5. The v1.0 regression matrix remains green.
6. Physical scores report both error and evidence coverage.
7. At least one profile for each vessel class is evidence-backed and passes its independent holdouts.
8. Documentation makes no realism claim beyond the available evidence.
