'use client';

import {
  Clock3,
  Compass,
  Gauge,
  MapPin,
  Navigation,
  Route,
} from 'lucide-react';
import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { getScenarioDefinition } from '@/sim/scenarios/ScenarioCatalog';
import { getResolvedScenarioRoute } from '@/sim/scenarios/ScenarioRoute';
import { useSimStore } from '@/store/useSimStore';

const MAP_WIDTH = 240;
const MAP_HEIGHT = 170;
const MAP_PADDING = 18;

function formatDuration(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

function formatDistance(distanceM: number) {
  if (!Number.isFinite(distanceM)) return '—';
  if (distanceM >= 1_000) return `${(distanceM / 1_000).toFixed(2)} km`;
  return `${Math.round(distanceM)} m`;
}

export default function NavigationHUD() {
  const state = useSimStore(
    useShallow((store) => ({
      activeScenario: store.activeScenario,
      scenarioRunStatus: store.scenarioRunStatus,
      activeWaypointIndex: store.activeWaypointIndex,
      scenarioElapsedSeconds: store.scenarioElapsedSeconds,
      scenarioProgress: store.scenarioProgress,
      navigationDistanceM: store.navigationDistanceM,
      navigationBearingDeg: store.navigationBearingDeg,
      navigationRelativeBearingDeg: store.navigationRelativeBearingDeg,
      navigationBoatX: store.navigationBoatX,
      navigationBoatZ: store.navigationBoatZ,
      heading: store.heading,
      speedKnots: store.speedKnots,
    })),
  );
  const scenario = useMemo(
    () => getScenarioDefinition(state.activeScenario),
    [state.activeScenario],
  );
  const route = useMemo(
    () => getResolvedScenarioRoute(state.activeScenario),
    [state.activeScenario],
  );

  const chart = useMemo(() => {
    const points = [{ x: 0, z: 0 }, ...route];
    const rawMinX = Math.min(...points.map((point) => point.x));
    const rawMaxX = Math.max(...points.map((point) => point.x));
    const rawMinZ = Math.min(...points.map((point) => point.z));
    const rawMaxZ = Math.max(...points.map((point) => point.z));
    const minSpan = 120;
    const centerX = (rawMinX + rawMaxX) / 2;
    const centerZ = (rawMinZ + rawMaxZ) / 2;
    const spanX = Math.max(minSpan, rawMaxX - rawMinX);
    const spanZ = Math.max(minSpan, rawMaxZ - rawMinZ);
    const minX = centerX - spanX / 2;
    const minZ = centerZ - spanZ / 2;
    const scale = Math.min(
      (MAP_WIDTH - MAP_PADDING * 2) / spanX,
      (MAP_HEIGHT - MAP_PADDING * 2) / spanZ,
    );
    const renderedWidth = spanX * scale;
    const renderedHeight = spanZ * scale;
    const offsetX = (MAP_WIDTH - renderedWidth) / 2 - minX * scale;
    const offsetY = (MAP_HEIGHT - renderedHeight) / 2 - minZ * scale;
    const project = (x: number, z: number) => ({
      x: offsetX + x * scale,
      y: offsetY + z * scale,
    });

    return {
      project,
      routePoints: [project(0, 0), ...route.map((point) => project(point.x, point.z))],
    };
  }, [route]);

  if (state.scenarioRunStatus !== 'active' || route.length === 0) {
    return null;
  }

  const waypointIndex = Math.min(
    state.activeWaypointIndex,
    route.length - 1,
  );
  const activeWaypoint = route[waypointIndex];
  const activeMapPoint = chart.project(
    activeWaypoint.x,
    activeWaypoint.z,
  );
  const boatMapPoint = chart.project(
    state.navigationBoatX,
    state.navigationBoatZ,
  );
  const remainingSeconds = Math.max(
    0,
    scenario.mission.timeLimitSeconds - state.scenarioElapsedSeconds,
  );
  const finalWaypoint = waypointIndex === route.length - 1;
  const finalSpeedLimit = scenario.mission.finalSpeedMaxKnots;
  const slowingRequired =
    finalWaypoint &&
    finalSpeedLimit !== undefined &&
    state.navigationDistanceM <= activeWaypoint.radiusM &&
    Math.abs(state.speedKnots) > finalSpeedLimit;
  const routePointString = chart.routePoints
    .map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`)
    .join(' ');

  return (
    <section
      aria-label="Marine navigation chart"
      className="pointer-events-none absolute left-3 top-[5.25rem] z-[62] w-40 rounded-2xl border border-white/10 bg-slate-950/78 p-2.5 text-white shadow-2xl backdrop-blur-xl md:left-auto md:right-4 md:top-28 md:w-72 md:p-4"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5 text-[8px] font-bold uppercase tracking-[0.18em] text-sky-300 md:text-[10px]">
            <Navigation className="h-3 w-3" /> Marine chart
          </div>
          <div className="mt-0.5 max-w-32 truncate text-[10px] font-semibold text-slate-100 md:max-w-48 md:text-sm">
            {activeWaypoint.label}
          </div>
        </div>
        <div className="flex h-8 w-8 items-center justify-center rounded-full border border-sky-300/20 bg-sky-300/10 md:h-10 md:w-10">
          <Navigation
            className="h-4 w-4 text-sky-300 transition-transform md:h-5 md:w-5"
            style={{
              transform: `rotate(${state.navigationRelativeBearingDeg}deg)`,
            }}
          />
        </div>
      </div>

      <div className="mt-2 overflow-hidden rounded-xl border border-white/8 bg-slate-950/75 md:mt-3">
        <svg
          viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
          role="img"
          aria-label={`Route chart to ${activeWaypoint.label}`}
          className="h-28 w-full md:h-40"
        >
          <defs>
            <pattern
              id="navigation-grid"
              width="24"
              height="24"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 24 0 L 0 0 0 24"
                fill="none"
                stroke="rgba(148,163,184,0.12)"
                strokeWidth="1"
              />
            </pattern>
          </defs>
          <rect width={MAP_WIDTH} height={MAP_HEIGHT} fill="#07111f" />
          <rect width={MAP_WIDTH} height={MAP_HEIGHT} fill="url(#navigation-grid)" />
          <text
            x={MAP_WIDTH - 15}
            y={16}
            textAnchor="middle"
            fill="#7dd3fc"
            fontSize="9"
            fontWeight="700"
          >
            N
          </text>
          <line
            x1={MAP_WIDTH - 15}
            y1={21}
            x2={MAP_WIDTH - 15}
            y2={37}
            stroke="#7dd3fc"
            strokeWidth="1.5"
          />
          <polyline
            points={routePointString}
            fill="none"
            stroke="#38bdf8"
            strokeWidth="2"
            strokeDasharray="5 4"
            opacity="0.62"
          />
          {route.map((waypoint, index) => {
            const point = chart.project(waypoint.x, waypoint.z);
            const completed = index < waypointIndex;
            const active = index === waypointIndex;
            return (
              <g key={waypoint.id}>
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={active ? 7 : 5}
                  fill={
                    completed
                      ? '#34d399'
                      : active
                        ? '#38bdf8'
                        : '#334155'
                  }
                  stroke={active ? '#e0f2fe' : '#94a3b8'}
                  strokeWidth={active ? 2 : 1}
                />
                <text
                  x={point.x}
                  y={point.y + 3}
                  textAnchor="middle"
                  fill={active || completed ? '#020617' : '#cbd5e1'}
                  fontSize="8"
                  fontWeight="800"
                >
                  {index + 1}
                </text>
              </g>
            );
          })}
          <circle
            cx={activeMapPoint.x}
            cy={activeMapPoint.y}
            r="12"
            fill="none"
            stroke="#38bdf8"
            strokeWidth="1.5"
            opacity="0.5"
          />
          <g
            transform={`translate(${boatMapPoint.x} ${boatMapPoint.y}) rotate(${state.heading})`}
          >
            <path
              d="M 0 -9 L 6 7 L 0 4 L -6 7 Z"
              fill="#f8fafc"
              stroke="#0ea5e9"
              strokeWidth="1.5"
            />
          </g>
        </svg>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-1.5 md:mt-3 md:gap-2">
        <div className="rounded-lg bg-white/5 px-2 py-1.5">
          <div className="flex items-center gap-1 text-[7px] font-bold uppercase tracking-wider text-slate-500 md:text-[9px]">
            <MapPin className="h-2.5 w-2.5" /> Distance
          </div>
          <div className="mt-0.5 font-mono text-[10px] text-sky-200 md:text-sm">
            {formatDistance(state.navigationDistanceM)}
          </div>
        </div>
        <div className="rounded-lg bg-white/5 px-2 py-1.5">
          <div className="flex items-center gap-1 text-[7px] font-bold uppercase tracking-wider text-slate-500 md:text-[9px]">
            <Compass className="h-2.5 w-2.5" /> Bearing
          </div>
          <div className="mt-0.5 font-mono text-[10px] text-indigo-200 md:text-sm">
            {Math.round(state.navigationBearingDeg)
              .toString()
              .padStart(3, '0')}
            °
          </div>
        </div>
        <div className="rounded-lg bg-white/5 px-2 py-1.5">
          <div className="flex items-center gap-1 text-[7px] font-bold uppercase tracking-wider text-slate-500 md:text-[9px]">
            <Clock3 className="h-2.5 w-2.5" /> Remaining
          </div>
          <div className="mt-0.5 font-mono text-[10px] text-amber-200 md:text-sm">
            {formatDuration(remainingSeconds)}
          </div>
        </div>
        <div className="rounded-lg bg-white/5 px-2 py-1.5">
          <div className="flex items-center gap-1 text-[7px] font-bold uppercase tracking-wider text-slate-500 md:text-[9px]">
            <Route className="h-2.5 w-2.5" /> Mark
          </div>
          <div className="mt-0.5 font-mono text-[10px] text-emerald-200 md:text-sm">
            {waypointIndex + 1}/{route.length}
          </div>
        </div>
      </div>

      <div className="mt-2 md:mt-3">
        <div className="mb-1 flex items-center justify-between text-[7px] font-bold uppercase tracking-wider text-slate-500 md:text-[9px]">
          <span>Route progress</span>
          <span>{Math.round(state.scenarioProgress * 100)}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-sky-500 to-emerald-400 transition-[width] duration-300"
            style={{ width: `${state.scenarioProgress * 100}%` }}
          />
        </div>
      </div>

      <div
        className={`mt-2 rounded-lg border px-2 py-1.5 text-[8px] leading-3.5 md:mt-3 md:px-3 md:py-2 md:text-[10px] md:leading-4 ${
          slowingRequired
            ? 'border-amber-400/35 bg-amber-400/10 text-amber-200'
            : 'border-white/8 bg-white/[0.035] text-slate-400'
        }`}
      >
        {slowingRequired ? (
          <span className="flex items-start gap-1.5">
            <Gauge className="mt-0.5 h-3 w-3 shrink-0" />
            Reduce speed below {finalSpeedLimit?.toFixed(1)} knots to complete
            the final gate.
          </span>
        ) : (
          activeWaypoint.guidance
        )}
      </div>
    </section>
  );
}
