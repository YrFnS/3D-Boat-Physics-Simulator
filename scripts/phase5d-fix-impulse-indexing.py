from pathlib import Path
from textwrap import dedent


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}.")
    return source.replace(old, new, 1)


collision = Path("sim/collision/RapierCollisionWorld.ts")
source = collision.read_text(encoding="utf-8")
start = source.index("            let maximumPenetrationM = 0;")
end = source.index(
    "            // Predictive contacts may not yet have a solver point.",
    start,
)
replacement = dedent(
    """\
    let maximumPenetrationM = 0;
    let maximumSolvedImpulseNs = 0;
    for (let index = 0; index < geometricContactCount; index += 1) {
      const signedDistanceM = manifold.contactDist(index);
      if (Number.isFinite(signedDistanceM)) {
        maximumPenetrationM = Math.max(
          maximumPenetrationM,
          Math.max(0, -signedDistanceM),
        );
      }

      // Rapier stores solved impulses on the geometric contacts. The
      // solver-contact list is separate and is used below only for
      // world-space contact points and closing-speed diagnostics.
      const rawNormalImpulseNs = manifold.contactImpulse(index);
      const rawTangentImpulseXNs =
        manifold.contactTangentImpulseX(index);
      const rawTangentImpulseYNs =
        manifold.contactTangentImpulseY(index);
      const normalImpulseNs = Number.isFinite(rawNormalImpulseNs)
        ? Math.abs(rawNormalImpulseNs)
        : 0;
      const tangentImpulseXNs = Number.isFinite(
        rawTangentImpulseXNs,
      )
        ? rawTangentImpulseXNs
        : 0;
      const tangentImpulseYNs = Number.isFinite(
        rawTangentImpulseYNs,
      )
        ? rawTangentImpulseYNs
        : 0;
      maximumSolvedImpulseNs = Math.max(
        maximumSolvedImpulseNs,
        Math.hypot(
          normalImpulseNs,
          tangentImpulseXNs,
          tangentImpulseYNs,
        ),
      );
    }

    let maximumImpactSpeedMps = 0;
    for (let index = 0; index < solverContactCount; index += 1) {
      const rawPoint = manifold.solverContactPoint(index);
      this.contactPoint.set(rawPoint.x, rawPoint.y, rawPoint.z);
      this.pointOffset
        .copy(this.contactPoint)
        .sub(this.preStepCenterOfMass);
      this.pointVelocity
        .copy(this.preStepAngularVelocity)
        .cross(this.pointOffset)
        .add(this.preStepLinearVelocity);
      maximumImpactSpeedMps = Math.max(
        maximumImpactSpeedMps,
        Math.max(0, -this.pointVelocity.dot(this.normal)),
      );
    }

    """
)
replacement = "".join(
    f"            {line}" if line.strip() else line
    for line in replacement.splitlines(keepends=True)
)
collision.write_text(source[:start] + replacement + source[end:], encoding="utf-8")

regression = Path("scripts/collision-authority.mjs")
source = regression.read_text(encoding="utf-8")
function_start = source.index("function collectMaximumSolverImpulse(")
function_end = source.index("function runImpactScenario(", function_start)
function = dedent(
    """\
    function collectMaximumContactImpulse(
      world,
      vesselColliders,
      vesselColliderHandles,
    ) {
      let maximumImpulseNs = 0;
      let geometricContactCount = 0;
      let solverContactCount = 0;

      for (const vesselCollider of vesselColliders) {
        world.contactPairsWith(vesselCollider, (otherCollider) => {
          if (vesselColliderHandles.has(otherCollider.handle)) return;
          world.contactPair(vesselCollider, otherCollider, (manifold) => {
            const contactCount = manifold.numContacts();
            const solverCount = manifold.numSolverContacts();
            geometricContactCount += contactCount;
            solverContactCount += solverCount;

            // Rapier stores solved impulses on geometric contacts. Solver
            // contacts expose the reduced world-space point set.
            for (let index = 0; index < contactCount; index += 1) {
              const normalImpulseNs = manifold.contactImpulse(index);
              const tangentImpulseXNs =
                manifold.contactTangentImpulseX(index);
              const tangentImpulseYNs =
                manifold.contactTangentImpulseY(index);
              const impulseNs = Math.hypot(
                Number.isFinite(normalImpulseNs) ? normalImpulseNs : 0,
                Number.isFinite(tangentImpulseXNs)
                  ? tangentImpulseXNs
                  : 0,
                Number.isFinite(tangentImpulseYNs)
                  ? tangentImpulseYNs
                  : 0,
              );
              maximumImpulseNs = Math.max(maximumImpulseNs, impulseNs);
            }
          });
        });
      }

      return {
        maximumImpulseNs,
        geometricContactCount,
        solverContactCount,
      };
    }

    """
)
source = source[:function_start] + function + source[function_end:]
source = replace_once(
    source,
    "    const contact = collectMaximumSolverImpulse(\n",
    "    const contact = collectMaximumContactImpulse(\n",
    "regression collector call",
)
source = replace_once(
    source,
    dedent(
        """\
          let maximumImpulseNs = 0;
          let solverContactCount = 0;
          for (let step = 0; step < SIMULATION_STEPS; step += 1) {
        """
    ),
    dedent(
        """\
          let maximumImpulseNs = 0;
          let geometricContactCount = 0;
          let solverContactCount = 0;
          for (let step = 0; step < SIMULATION_STEPS; step += 1) {
        """
    ),
    "regression counters",
)
source = replace_once(
    source,
    dedent(
        """\
            solverContactCount += contact.solverContactCount;
          }
        """
    ),
    dedent(
        """\
            geometricContactCount += contact.geometricContactCount;
            solverContactCount += contact.solverContactCount;
          }
        """
    ),
    "regression accumulators",
)
source = replace_once(
    source,
    dedent(
        """\
            maximumImpulseNs,
            solverContactCount,
        """
    ),
    dedent(
        """\
            maximumImpulseNs,
            geometricContactCount,
            solverContactCount,
        """
    ),
    "regression result fields",
)
source = replace_once(
    source,
    dedent(
        """\
          assert.ok(
            result.solverContactCount > 0,
            `${name} scenario must generate solver contacts`,
          );
        """
    ),
    dedent(
        """\
          assert.ok(
            result.geometricContactCount > 0,
            `${name} scenario must generate geometric contacts`,
          );
          assert.ok(
            result.solverContactCount > 0,
            `${name} scenario must generate solver contacts`,
          );
        """
    ),
    "regression contact assertions",
)
regression.write_text(source, encoding="utf-8")
