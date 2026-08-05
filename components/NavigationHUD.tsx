'use client';

import {
  CheckCircle2,
  Clock3,
  Compass,
  Flag,
  Gauge,
  LifeBuoy,
  MapPin,
  MapPinned,
  Navigation,
  PackageCheck,
  RotateCcw,
  Route,
  Trash2,
  Undo2,
} from 'lucide-react';
import {
  useMemo,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useShallow } from 'zustand/react/shallow';
import { getScenarioDefinition } from '@/sim/scenarios/ScenarioCatalog';
import {
  getResolvedScenarioEntities,
  getResolvedScenarioRoute,
} from '@/sim/scenarios/ScenarioRoute';
import {
  MAX_FREE_NAVIGATION_WAYPOINTS,
  useNavigationPlanner,
} from '@/store/useNavigationPlanner';
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
      completedScenarioEntityIds: store.completedScenarioEntityIds,
      scenarioEventMessage: store.scenarioEventMessage,
      scenarioCheckpointLabel: store.scenarioCheckpointLabel,
    })),
  );
  const planner = useNavigationPlanner(
    useShallow((store) => ({
      mode: store.mode,
      status: store.status,
      waypoints: store.waypoints,
      activeWaypointIndex: store.activeWaypointIndex,
      elapsedSeconds: store.elapsedSeconds,
      progress: store.progress,
      distanceM: store.distanceM,
      bearingDeg: store.bearingDeg,
      relativeBearingDeg: store.relativeBearingDeg,
      setMode: store.setMode,
      addWaypoint: store.addWaypoint,
      undoWaypoint: store.undoWaypoint,
      clearWaypoints: store.clearWaypoints,
      restartFreeRoute: store.restartFreeRoute,
    })),
  );
  const scenario = useMemo(
    () => getScenarioDefinition(state.activeScenario),
    [state.activeScenario],
  );
  const missionRoute = useMemo(
    () => getResolvedScenarioRoute(state.activeScenario),
    [state.activeScenario],
  );
  const entities = useMemo(
    () => getResolvedScenarioEntities(state.activeScenario),
    [state.activeScenario],
  );
  const completedEntitySet = useMemo(
    () => new Set(state.completedScenarioEntityIds),
    [state.completedScenarioEntityIds],
  );
  const freeMode = planner.mode === 'free';
  const displayRoute = freeMode ? planner.waypoints : missionRoute;
  const waypointIndex = Math.min(
    freeMode ? planner.activeWaypointIndex : state.activeWaypointIndex,
    Math.max(0, displayRoute.length - 1),
  );
  const activeWaypoint = displayRoute[waypointIndex] ?? null;
  const activeMissionWaypointId = missionRoute[state.activeWaypointIndex]?.id;
  const activeEntity = entities.find(
    (entity) =>
      entity.waypointId === activeMissionWaypointId &&
      !completedEntitySet.has(entity.id) &&
      (!entity.requiresEntityId ||
        completedEntitySet.has(entity.requiresEntityId)),
  );
  const requiredEntities = entities.filter((entity) => entity.required);
  const completedRequiredEntities = requiredEntities.filter((entity) =>
    completedEntitySet.has(entity.id),
  ).length;

  const chart = useMemo(() => {
    const points = [
      { x: 0, z: 0 },
      ...missionRoute,
      ...planner.waypoints,
      { x: state.navigationBoatX, z: state.navigationBoatZ },
    ];
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
    const unproject = (x: number, y: number) => ({
      x: (x - offsetX) / scale,
      z: (y - offsetY) / scale,
    });

    return {
      project,
      unproject,
      missionRoutePoints: [
        project(0, 0),
        ...missionRoute.map((point) => project(point.x, point.z)),
      ],
      freeRoutePoints: [
        project(state.navigationBoatX, state.navigationBoatZ),
        ...planner.waypoints.map((point) => project(point.x, point.z)),
      ],
    };
  }, [
    missionRoute,
    planner.waypoints,
    state.navigationBoatX,
    state.navigationBoatZ,
  ]);

  if (state.scenarioRunStatus !== 'active' || missionRoute.length === 0) {
    return null;
  }

  const navigationDistanceM = freeMode
    ? planner.distanceM
    : state.navigationDistanceM;
  const navigationBearingDeg = freeMode
    ? planner.bearingDeg
    : state.navigationBearingDeg;
  const navigationRelativeBearingDeg = freeMode
    ? planner.relativeBearingDeg
    : state.navigationRelativeBearingDeg;
  const routeProgress = freeMode ? planner.progress : state.scenarioProgress;
  const elapsedSeconds = freeMode
    ? planner.elapsedSeconds
    : state.scenarioElapsedSeconds;
  const remainingSeconds = Math.max(
    0,
    scenario.mission.timeLimitSeconds - state.scenarioElapsedSeconds,
  );
  const finalWaypoint =
    !freeMode && waypointIndex === missionRoute.length - 1;
  const finalSpeedLimit = scenario.mission.finalSpeedMaxKnots;
  const slowingRequired =
    finalWaypoint &&
    activeWaypoint !== null &&
    finalSpeedLimit !== undefined &&
    navigationDistanceM <= activeWaypoint.radiusM &&
    Math.abs(state.speedKnots) > finalSpeedLimit;
  const activeMapPoint = activeWaypoint
    ? chart.project(activeWaypoint.x, activeWaypoint.z)
    : null;
  const boatMapPoint = chart.project(
    state.navigationBoatX,
    state.navigationBoatZ,
  );
  const missionRoutePointString = chart.missionRoutePoints
    .map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`)
    .join(' ');
  const freeRoutePointString = chart.freeRoutePoints
    .map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`)
    .join(' ');

  const handlePlot = (
    event: ReactPointerEvent<SVGSVGElement>,
  ) => {
    if (
      !freeMode ||
      planner.waypoints.length >= MAX_FREE_NAVIGATION_WAYPOINTS
    ) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const svgX =
      ((event.clientX - rect.left) / Math.max(1, rect.width)) * MAP_WIDTH;
    const svgY =
      ((event.clientY - rect.top) / Math.max(1, rect.height)) * MAP_HEIGHT;
    const world = chart.unproject(svgX, svgY);
    planner.addWaypoint(world.x, world.z);
  };

  const guidance = freeMode
    ? planner.waypoints.length === 0
      ? 'Tap or click the chart to plot up to eight safe-water marks.'
      : planner.status === 'completed'
        ? 'Free route complete. Restart it, add another mark, or return to the scored mission.'
        : activeWaypoint?.adjustedForSafety
          ? 'This mark was moved slightly to the nearest safe navigable water.'
          : 'Follow the amber bearing to the active plotted mark.'
    : slowingRequired
      ? `Reduce speed below ${finalSpeedLimit?.toFixed(1)} knots to complete the final gate.`
      : activeEntity?.guidance ?? activeWaypoint?.guidance ?? '';

  return (
    <section
      aria-label="Marine navigation chart"
      className="pointer-events-auto absolute left-3 top-[5.25rem] z-[62] w-44 rounded-2xl border border-white/10 bg-slate-950/82 p-2.5 text-white shadow-2xl backdrop-blur-xl md:left-auto md:right-[13.5rem] md:top-28 md:w-72 md:p-4"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[8px] font-bold uppercase tracking-[0.18em] text-sky-300 md:text-[10px]">
            {freeMode ? (
              <MapPinned className="h-3 w-3 text-amber-300" />
            ) : (
              <Navigation className="h-3 w-3" />
            )}
            {freeMode ? 'Free plotter' : 'Marine chart'}
          </div>
          <div className="mt-0.5 max-w-28 truncate text-[10px] font-semibold text-slate-100 md:max-w-44 md:text-sm">
            {activeWaypoint?.label ?? 'Plot your first mark'}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {freeMode && (
            <>
              <button
                type="button"
                aria-label="Undo plotted waypoint"
                title="Undo last plotted mark"
                disabled={planner.waypoints.length === 0}
                onClick={planner.undoWaypoint}
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/8 bg-white/5 text-slate-300 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35 md:h-8 md:w-8"
              >
                <Undo2 className="h-3 w-3" />
              </button>
              <button
                type="button"
                aria-label="Clear plotted route"
                title="Clear plotted route"
                disabled={planner.waypoints.length === 0}
                onClick={planner.clearWaypoints}
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/8 bg-white/5 text-slate-300 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35 md:h-8 md:w-8"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </>
          )}
          <button
            type="button"
            aria-label={
              freeMode
                ? 'Return to mission route'
                : 'Open free route plotter'
            }
            title={freeMode ? 'Return to mission' : 'Plot a free route'}
            onClick={() => planner.setMode(freeMode ? 'mission' : 'free')}
            className={`flex h-8 w-8 items-center justify-center rounded-full border md:h-10 md:w-10 ${
              freeMode
                ? 'border-amber-300/30 bg-amber-300/12 text-amber-300'
                : 'border-sky-300/20 bg-sky-300/10 text-sky-300'
            }`}
          >
            {freeMode ? (
              <Route className="h-4 w-4 md:h-5 md:w-5" />
            ) : (
              <MapPinned className="h-4 w-4 md:h-5 md:w-5" />
            )}
          </button>
        </div>
      </div>

      <div className="mt-2 overflow-hidden rounded-xl border border-white/8 bg-slate-950/75 md:mt-3">
        <svg
          viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
          role="img"
          aria-label="Navigation plotter"
          onPointerDown={handlePlot}
          className={`h-28 w-full md:h-40 ${
            freeMode ? 'cursor-crosshair touch-none' : ''
          }`}
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
            points={missionRoutePointString}
            fill="none"
            stroke="#38bdf8"
            strokeWidth={freeMode ? 1.2 : 2}
            strokeDasharray="5 4"
            opacity={freeMode ? 0.22 : 0.62}
          />
          {freeMode && planner.waypoints.length > 0 && (
            <polyline
              points={freeRoutePointString}
              fill="none"
              stroke="#fbbf24"
              strokeWidth="2.2"
              strokeDasharray="4 3"
              opacity="0.86"
            />
          )}
          {(freeMode ? planner.waypoints : missionRoute).map(
            (waypoint, index) => {
              const point = chart.project(waypoint.x, waypoint.z);
              const completed = index < waypointIndex;
              const active = index === waypointIndex;
              const activeColor = freeMode ? '#fbbf24' : '#38bdf8';
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
                          ? activeColor
                          : '#334155'
                    }
                    stroke={active ? '#f8fafc' : '#94a3b8'}
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
            },
          )}
          {!freeMode &&
            entities.map((entity) => {
              const point = chart.project(entity.x, entity.z);
              const completed = completedEntitySet.has(entity.id);
              return (
                <rect
                  key={entity.id}
                  x={point.x - 3.5}
                  y={point.y - 3.5}
                  width="7"
                  height="7"
                  rx="1.5"
                  transform={`rotate(45 ${point.x} ${point.y})`}
                  fill={completed ? '#34d399' : '#fbbf24'}
                  stroke="#f8fafc"
                  strokeWidth="0.8"
                />
              );
            })}
          {activeMapPoint && (
            <circle
              cx={activeMapPoint.x}
              cy={activeMapPoint.y}
              r="12"
              fill="none"
              stroke={freeMode ? '#fbbf24' : '#38bdf8'}
              strokeWidth="1.5"
              opacity="0.5"
            />
          )}
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

      {freeMode && (
        <div className="mt-1.5 flex items-center justify-between gap-2 text-[7px] font-bold uppercase tracking-wider text-slate-500 md:text-[9px]">
          <span>
            {planner.waypoints.length}/{MAX_FREE_NAVIGATION_WAYPOINTS} plotted
          </span>
          {planner.status === 'completed' && (
            <button
              type="button"
              onClick={planner.restartFreeRoute}
              className="flex items-center gap-1 rounded-md bg-amber-300/10 px-1.5 py-1 text-amber-200"
            >
              <RotateCcw className="h-2.5 w-2.5" /> Restart
            </button>
          )}
        </div>
      )}

      <div className="mt-2 grid grid-cols-2 gap-1.5 md:mt-3 md:gap-2">
        <div className="rounded-lg bg-white/5 px-2 py-1.5">
          <div className="flex items-center gap-1 text-[7px] font-bold uppercase tracking-wider text-slate-500 md:text-[9px]">
            <MapPin className="h-2.5 w-2.5" /> Distance
          </div>
          <div className="mt-0.5 font-mono text-[10px] text-sky-200 md:text-sm">
            {activeWaypoint ? formatDistance(navigationDistanceM) : '—'}
          </div>
        </div>
        <div className="rounded-lg bg-white/5 px-2 py-1.5">
          <div className="flex items-center gap-1 text-[7px] font-bold uppercase tracking-wider text-slate-500 md:text-[9px]">
            <Compass className="h-2.5 w-2.5" /> Bearing
          </div>
          <div className="mt-0.5 font-mono text-[10px] text-indigo-200 md:text-sm">
            {activeWaypoint
              ? `${Math.round(navigationBearingDeg)
                  .toString()
                  .padStart(3, '0')}°`
              : '—'}
          </div>
        </div>
        <div className="rounded-lg bg-white/5 px-2 py-1.5">
          <div className="flex items-center gap-1 text-[7px] font-bold uppercase tracking-wider text-slate-500 md:text-[9px]">
            <Clock3 className="h-2.5 w-2.5" />
            {freeMode ? 'Elapsed' : 'Remaining'}
          </div>
          <div className="mt-0.5 font-mono text-[10px] text-amber-200 md:text-sm">
            {formatDuration(freeMode ? elapsedSeconds : remainingSeconds)}
          </div>
        </div>
        <div className="rounded-lg bg-white/5 px-2 py-1.5">
          <div className="flex items-center gap-1 text-[7px] font-bold uppercase tracking-wider text-slate-500 md:text-[9px]">
            <Flag className="h-2.5 w-2.5" /> Mark
          </div>
          <div className="mt-0.5 font-mono text-[10px] text-emerald-200 md:text-sm">
            {displayRoute.length > 0
              ? `${waypointIndex + 1}/${displayRoute.length}`
              : '0/0'}
          </div>
        </div>
      </div>

      <div className="mt-2 md:mt-3">
        <div className="mb-1 flex items-center justify-between text-[7px] font-bold uppercase tracking-wider text-slate-500 md:text-[9px]">
          <span>{freeMode ? 'Free route' : 'Mission route'}</span>
          <span>{Math.round(routeProgress * 100)}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            className={`h-full rounded-full transition-[width] duration-300 ${
              freeMode
                ? 'bg-gradient-to-r from-amber-500 to-yellow-300'
                : 'bg-gradient-to-r from-sky-500 to-emerald-400'
            }`}
            style={{ width: `${routeProgress * 100}%` }}
          />
        </div>
      </div>

      {!freeMode && (
        <div className="mt-2 grid grid-cols-2 gap-1.5 text-[8px] md:mt-3 md:text-[10px]">
          <div className="rounded-lg border border-white/8 bg-white/[0.035] px-2 py-1.5 text-slate-400">
            <div className="flex items-center gap-1 text-[7px] font-bold uppercase tracking-wider text-slate-500 md:text-[9px]">
              {activeEntity?.type.includes('rescue') ? (
                <LifeBuoy className="h-2.5 w-2.5" />
              ) : (
                <PackageCheck className="h-2.5 w-2.5" />
              )}
              Tasks
            </div>
            <div className="mt-0.5 font-mono text-slate-200">
              {completedRequiredEntities}/{requiredEntities.length}
            </div>
          </div>
          <div className="rounded-lg border border-white/8 bg-white/[0.035] px-2 py-1.5 text-slate-400">
            <div className="flex items-center gap-1 text-[7px] font-bold uppercase tracking-wider text-slate-500 md:text-[9px]">
              <CheckCircle2 className="h-2.5 w-2.5" /> Recovery
            </div>
            <div className="mt-0.5 truncate text-slate-200">
              {state.scenarioCheckpointLabel}
            </div>
          </div>
        </div>
      )}

      <div
        className={`mt-2 rounded-lg border px-2 py-1.5 text-[8px] leading-3.5 md:mt-3 md:px-3 md:py-2 md:text-[10px] md:leading-4 ${
          slowingRequired
            ? 'border-amber-400/35 bg-amber-400/10 text-amber-200'
            : freeMode
              ? 'border-amber-300/20 bg-amber-300/7 text-amber-100'
              : 'border-white/8 bg-white/[0.035] text-slate-400'
        }`}
      >
        <span className="flex items-start gap-1.5">
          {slowingRequired ? (
            <Gauge className="mt-0.5 h-3 w-3 shrink-0" />
          ) : freeMode ? (
            <MapPinned className="mt-0.5 h-3 w-3 shrink-0" />
          ) : null}
          {guidance}
        </span>
      </div>

      {!freeMode && state.scenarioEventMessage && (
        <div className="mt-1.5 rounded-lg border border-emerald-300/15 bg-emerald-300/7 px-2 py-1.5 text-[8px] leading-3.5 text-emerald-200 md:text-[9px]">
          {state.scenarioEventMessage}
        </div>
      )}

      {activeWaypoint && (
        <span className="sr-only">
          Turn {navigationRelativeBearingDeg < 0 ? 'left' : 'right'} toward the
          active mark.
        </span>
      )}
    </section>
  );
}
