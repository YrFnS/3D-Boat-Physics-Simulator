# Vessel physics calibration

The Phase 2 calibration harness runs the production fixed-step vessel simulation in accelerated, deterministic scenarios. Each scenario advances the same 60 Hz simulation used by the interactive application and publishes a machine-readable result for browser automation.

For both the trawler and speedboat, the suite validates:

- calm-water equilibrium and submersion;
- roll recovery after a controlled disturbance;
- maximum and steady forward speed;
- throttle-cut stopping time and distance;
- one controlled 180-degree turning maneuver;
- shoreline grounding followed by reverse release;
- an angled glancing contact;
- a higher-speed head-on impact.

Collision scenarios use the Rapier compound-hull contact world while the custom six-degree-of-freedom body remains authoritative for momentum, buoyancy, hydrodynamics, and damage. A predictive contact skin begins impulse response before fast hulls build deep overlap, while penetration diagnostics report the residual overlap after the bounded correction applied to the authoritative body.

Planing-hull calibration also bounds lateral hydrodynamic acceleration and applies drag below the vessel center of mass. This preserves useful lateral grip while preventing quadratic resistance from creating an unrealistic overturning moment during a hard turn.

The workflow rejects non-finite state, missing contact classification, excessive residual penetration, excessive roll or angular speed, unrealistic damage, and failure to slow or release from grounding.
