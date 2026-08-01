# Phase 5E — Reference Selection and Initial Gap Report

This checkpoint selects two traceable manufacturer references and compares their published quantities with the current abstract v1 vessel configurations. It does **not** claim that either simulator vessel already represents the selected boat.

## Selected references

### Displacement workboat: De Wit Tomboy 26

Official source: <https://dewitworkboats.com/tomboy-26/>

The manufacturer publishes:

| Quantity | Published value |
|---|---:|
| Length overall | 7.96 m |
| Beam overall | 2.39 m |
| Draft | 1.22 m |
| Lightship weight | 5,670 kg |
| Standard engine | 90 kW |
| Speed | 7.5 kn / 3.85833 m/s |
| Bollard pull | 1,200 kgf |

The page does not publish loading condition, water density, wind, waves, depth, center of gravity, gearbox ratio, propeller geometry, rudder geometry, or detailed trial procedure. The profile therefore remains `provisional`.

### Planing speedboat: Axopar 22 Spyder

Official source: <https://www.axopar.com/boat-models/axopar-22/axopar-22-spyder/>

The manufacturer publishes:

| Quantity | Published value |
|---|---:|
| Hull | Twin-stepped 20-degree V |
| Length overall excluding engine | 7.2 m |
| Beam | 2.23 m |
| Weight excluding engine | 1,200 kg |
| Draft to propellers | 0.8 m |
| Engine range | 115–250 hp / approximately 85.8–186.4 kW |
| Maximum-speed statement | Up to 45 kn / 23.14998 m/s |
| Cruise example | 27 kn with one 200 hp Mercury |

“Up to 45 knots” is represented only as a maximum ceiling. It is not treated as a guaranteed lower-bound sea-trial result. Loading condition, propeller, center of gravity, acceleration, stopping, turning, and seakeeping data are still missing, so this profile also remains `provisional`.

## Current measured comparison

The exact branch calibration still passes all 20 v1 regression scenarios. The external profiles intentionally fail because the current v1 boats are abstract game vessels with different scale and power.

### Current trawler versus Tomboy 26

| Quantity | Current simulator | Reference | Difference |
|---|---:|---:|---:|
| Length | 4.00 m | 7.96 m | −49.7% |
| Beam | 2.00 m | 2.39 m | −16.3% |
| Configured mass | 1,500 kg | 5,670 kg lightship | −73.5% |
| Draft | 0.60 m | 1.22 m | −50.8% |
| Rated power | 240 kW | 90 kW standard | +166.7% |
| Steady speed | 9.58263 m/s | 3.85833 m/s | +148.4% |
| Bollard pull | Not measured | 1,200 kgf | Missing trial |

Result: comparison score **0/100**, measurement coverage **92%**, external evidence coverage **100%**, certification **false**.

This is not a coefficient-level mismatch. A Tomboy-calibrated vessel needs a dedicated full-scale geometry, mass, propulsion, and collision configuration rather than modifying the v1 trawler in place.

### Current speedboat versus Axopar 22 Spyder

| Quantity | Current simulator | Reference | Difference |
|---|---:|---:|---:|
| Length | 3.20 m | 7.20 m | −55.6% |
| Beam | 1.20 m | 2.23 m | −46.2% |
| Configured mass | 800 kg | 1,200 kg excluding engine | −33.3% |
| Draft | 0.30 m | 0.80 m to propellers | −62.5% |
| Rated power | 360 kW | 85.8–186.4 kW range | 93.1% above published maximum |
| Planing-hull classification | Yes | Twin-stepped planing hull | Match |
| Steady speed | 22.01584 m/s / 42.80 kn | Up to 23.14998 m/s / 45 kn | Below ceiling |
| Matched 27 kn cruise trial | Not measured | Published example | Missing trial |

Result: comparison score **21.74/100**, measurement coverage **92%**, external evidence coverage **100%**, certification **false**.

The apparent top-speed agreement is not sufficient validation because the simulated vessel is much smaller, lighter, shallower, and more powerful. Phase 5E must match the full configuration and then validate independent trial metrics.

## Architecture decision

The v1 `trawler` and `speedboat` configurations remain unchanged as release and gameplay baselines. Phase 5E will add separate evidence-oriented reference configurations and trials so calibration work cannot silently alter v1 behavior.

The next implementation checkpoint is:

1. add calibration-only Tomboy 26 and Axopar 22 configuration records;
2. distinguish lightship, test displacement, fuel, payload, and engine mass;
3. record unknown center-of-gravity, gearbox, propeller, and rudder fields explicitly;
4. add a matched static-draft trial and a 27 kn Axopar cruise-condition trial;
5. add a Tomboy bollard-pull trial contract;
6. keep acceleration, stopping, turning, roll decay, and seakeeping as missing holdouts until traceable data is available;
7. run sensitivity analysis before fitting any coefficient.

## Trust boundary

Manufacturer specifications certify only the quantities they state. They do not certify the simulator's maneuvering, stability, acceleration, stopping, collision, or sea-state response. Those claims require matched full-scale or model-test evidence with uncertainty and operating conditions.
