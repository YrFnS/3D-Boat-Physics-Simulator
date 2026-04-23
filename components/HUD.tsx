'use client';

import { useSimStore, BoatType } from '@/store/useSimStore';
import { Compass, Navigation, Wind, Ship, Activity, Thermometer, ShieldAlert, Navigation2, Sun, Moon, Sunrise, Sunset, Leaf, Snowflake, Cloud } from 'lucide-react';

export default function HUD() {
  const {
    windSpeed, windDir, currentSpeed, currentDir, engineThrust,
    speedKnots, heading, activeBoat,
    hullHealth, engineHealth, engineTemperature, rudderHealth,
    targetTime, targetSeason, setTargetTime, setTargetSeason,
    setWindSpeed, setWindDir, setCurrentSpeed, setCurrentDir, setEngineThrust, setActiveBoat,
    keys
  } = useSimStore();

  const isRepairing = keys.r && Math.abs(speedKnots) < 2.0 && engineThrust < 0.1 && !keys.w && !keys.s && !keys.arrowup && !keys.arrowdown;

  return (
    <div className="absolute inset-0 pointer-events-none p-4 flex flex-col justify-between z-50">
      
      {/* Top Bar: Boat Selector, Controls, & Environment */}
      <div className="flex justify-between items-start">
        <div className="bg-black/50 backdrop-blur-xl border border-white/10 rounded-2xl p-4 text-white shadow-2xl pointer-events-auto">
           <h2 className="text-xs font-bold text-slate-400 tracking-widest uppercase mb-3 flex items-center gap-2">
            <Ship className="w-4 h-4" /> Vessel
          </h2>
          <div className="flex gap-2">
            {(['trawler', 'speedboat'] as BoatType[]).map(boat => (
              <button 
                key={boat}
                onClick={() => setActiveBoat(boat)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold capitalize transition-all ${activeBoat === boat ? 'bg-sky-500 text-white' : 'bg-white/5 text-slate-300 hover:bg-white/10'}`}
              >
                {boat}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col items-center gap-2 pointer-events-auto">
            <div className="bg-black/40 backdrop-blur-md text-white/80 px-6 py-2 rounded-full border border-white/10 text-sm font-mono tracking-wider flex items-center gap-4">
              <span>[W/S] Throttle</span>
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
              <span>[A/D] Steer</span>
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
              <span 
                className={`cursor-pointer select-none transition-colors ${keys.r ? "text-emerald-400 font-bold" : "hover:text-emerald-300"}`}
                onPointerDown={() => useSimStore.getState().setKey('r', true)}
                onPointerUp={() => useSimStore.getState().setKey('r', false)}
                onPointerLeave={() => useSimStore.getState().setKey('r', false)}
              >
                HOLD [R] TO REPAIR
              </span>
            </div>
            {keys.r && !isRepairing && (
                <div className="text-xs text-red-400 font-bold uppercase tracking-widest animate-pulse">
                    Must slow down and cut throttle to repair!
                </div>
            )}
            {isRepairing && (
                <div className="bg-emerald-950/80 backdrop-blur-md border border-emerald-500/50 rounded-xl p-4 min-w-[320px] mt-2 flex flex-col gap-3 shadow-[0_0_30px_rgba(16,185,129,0.2)]">
                    <div className="flex items-center justify-center gap-2 text-emerald-400 font-bold uppercase tracking-widest text-sm animate-pulse mb-1">
                        <Activity className="w-5 h-5" /> Active Field Repair
                    </div>
                    
                    <div className="space-y-3">
                        {/* Hull Repair Bar */}
                        <div>
                            <div className="flex justify-between text-[10px] uppercase font-bold text-emerald-200 mb-1">
                                <span>Hull & Bilge Pumps</span>
                                <span>{hullHealth >= 99.9 ? 'FIXED' : `${hullHealth.toFixed(1)}%`}</span>
                            </div>
                            <div className="h-2 w-full bg-black/50 rounded-full overflow-hidden border border-emerald-500/30 relative">
                                <div className="h-full bg-emerald-500 transition-all duration-300" style={{ width: `${hullHealth}%` }}></div>
                                {hullHealth < 99.9 && (
                                    <div className="absolute top-0 bottom-0 left-0 right-0 bg-gradient-to-r from-transparent via-white/50 to-transparent w-full animate-shimmer"></div>
                                )}
                            </div>
                        </div>

                        {/* Engine Repair Bar */}
                        <div>
                            <div className="flex justify-between text-[10px] uppercase font-bold text-emerald-200 mb-1">
                                <span>Engine Block & Cooling</span>
                                <span>{engineHealth >= 99.9 ? 'FIXED' : `${engineHealth.toFixed(1)}%`}</span>
                            </div>
                            <div className="h-2 w-full bg-black/50 rounded-full overflow-hidden border border-emerald-500/30 relative">
                                <div className="h-full bg-emerald-500 transition-all duration-300" style={{ width: `${engineHealth}%` }}></div>
                                {engineHealth < 99.9 && (
                                    <div className="absolute top-0 bottom-0 left-0 right-0 bg-gradient-to-r from-transparent via-white/50 to-transparent w-full animate-shimmer"></div>
                                )}
                            </div>
                        </div>

                        {/* Rudder Repair Bar */}
                        <div>
                            <div className="flex justify-between text-[10px] uppercase font-bold text-emerald-200 mb-1">
                                <span>Steering Linkages</span>
                                <span>{rudderHealth >= 99.9 ? 'FIXED' : `${rudderHealth.toFixed(1)}%`}</span>
                            </div>
                            <div className="h-2 w-full bg-black/50 rounded-full overflow-hidden border border-emerald-500/30 relative">
                                <div className="h-full bg-emerald-500 transition-all duration-300" style={{ width: `${rudderHealth}%` }}></div>
                                {rudderHealth < 99.9 && (
                                    <div className="absolute top-0 bottom-0 left-0 right-0 bg-gradient-to-r from-transparent via-white/50 to-transparent w-full animate-shimmer"></div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
        
        {/* Right Environment Panel */}
        <div className="bg-black/50 backdrop-blur-xl border border-white/10 rounded-2xl p-4 text-white shadow-2xl pointer-events-auto flex flex-col gap-3">
            <h2 className="text-[10px] font-bold text-slate-400 tracking-widest uppercase flex items-center gap-2">
                Environment
            </h2>
            <div className="flex flex-col gap-2">
                <div className="flex gap-1 bg-white/5 p-1 rounded-lg">
                    {[
                        { label: 'Dawn', val: 6, icon: Sunrise },
                        { label: 'Noon', val: 12, icon: Sun },
                        { label: 'Dusk', val: 18, icon: Sunset },
                        { label: 'Night', val: 0, icon: Moon },
                    ].map(t => (
                        <button 
                            key={t.label} onClick={() => setTargetTime(t.val)}
                            className={`p-2 rounded-md transition-all ${targetTime === t.val ? 'bg-amber-500 text-white shadow-lg' : 'hover:bg-white/10 text-slate-400'}`}
                            title={t.label}
                        >
                            <t.icon className="w-4 h-4" />
                        </button>
                    ))}
                </div>
                <div className="flex gap-1 bg-white/5 p-1 rounded-lg">
                    {[
                        { label: 'Spring', val: 0, icon: Leaf },
                        { label: 'Summer', val: 0.25, icon: Sun },
                        { label: 'Fall', val: 0.5, icon: Wind },
                        { label: 'Winter', val: 0.75, icon: Snowflake },
                    ].map(s => (
                        <button 
                            key={s.label} onClick={() => setTargetSeason(s.val)}
                            className={`p-2 rounded-md transition-all ${targetSeason === s.val ? 'bg-sky-500 text-white shadow-lg' : 'hover:bg-white/10 text-slate-400'}`}
                            title={s.label}
                        >
                            <s.icon className="w-4 h-4" />
                        </button>
                    ))}
                </div>
            </div>
        </div>
      </div>

      <div className="flex justify-between items-end">
        {/* Left Panel: Telemetry Dashboard */}
        <div className="bg-black/50 backdrop-blur-xl border border-white/10 rounded-2xl p-6 text-white w-64 shadow-2xl">
          <h2 className="text-sm font-bold text-slate-400 tracking-widest uppercase flex items-center gap-2">
            <Navigation className="w-4 h-4" /> Telemetry
          </h2>
          
          {hullHealth <= 0 && (
            <div className="mt-3 flex flex-col gap-1">
                <div className="py-2 px-3 bg-red-600 border border-red-400 rounded flex items-center justify-center gap-2 animate-pulse shadow-[0_0_20px_rgba(220,38,38,0.6)]">
                  <ShieldAlert className="w-5 h-5 text-white" />
                  <span className="text-sm font-bold text-white uppercase tracking-widest">VESSEL SUNK</span>
                </div>
            </div>
          )}
          {hullHealth > 0 && engineHealth <= 0 && (
            <div className="mt-3 flex flex-col gap-1">
                <div className="py-2 px-3 bg-orange-600/50 border border-orange-500 rounded flex items-center justify-center gap-2 animate-pulse">
                  <Activity className="w-5 h-5 text-orange-200" />
                  <span className="text-sm font-bold text-orange-200 uppercase tracking-widest">ENGINE DEAD</span>
                </div>
            </div>
          )}
          {hullHealth > 0 && engineHealth > 0 && (engineHealth < 30 || rudderHealth < 30 || hullHealth < 30) && (
            <div className="mt-3 py-1.5 px-3 bg-red-500/20 border border-red-500/50 rounded flex items-center gap-2 animate-pulse">
              <ShieldAlert className="w-4 h-4 text-red-500" />
              <span className="text-xs font-bold text-red-500 uppercase tracking-widest">Critical Damage</span>
            </div>
          )}

          <div className="mb-6 mt-6">
            <div className="text-4xl font-mono tracking-tighter text-sky-400 mb-1 flex items-baseline gap-2">
              {Math.abs(speedKnots).toFixed(1)} <span className="text-lg text-slate-400">kts</span>
              {engineHealth < 40 && (
                <span className="text-xs font-bold text-amber-500 uppercase tracking-widest animate-pulse ml-auto" title="Engine Misfiring">[MISFIRE]</span>
              )}
            </div>
            <div className="text-xs text-slate-500 uppercase font-semibold">Speed Over Ground</div>
          </div>
          
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-1">
              <Compass className="w-8 h-8 text-indigo-400" style={{ transform: `rotate(${-heading}deg)` }} />
              <div className="text-3xl font-mono tracking-tighter text-indigo-300">
                {heading.toFixed(0).padStart(3, '0')}°
              </div>
            </div>
            <div className="text-xs text-slate-500 uppercase font-semibold">Compass Heading</div>
          </div>

          <div className="pt-4 border-t border-white/10 mb-4">
            <div className="text-xs text-slate-500 uppercase font-semibold mb-2">Engine Thrust</div>
            <input 
              type="range" min="0" max="1" step="0.01" 
              value={engineThrust} 
              onChange={(e) => setEngineThrust(parseFloat(e.target.value))}
              className="w-full cursor-pointer pointer-events-auto accent-sky-500"
            />
          </div>

          <div className="pt-4 border-t border-white/10 space-y-3">
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-[10px] text-slate-400 uppercase font-semibold flex items-center gap-1"><ShieldAlert className="w-3 h-3"/> Hull Int.</span>
                <span className="text-[10px] font-mono">{hullHealth.toFixed(0)}%</span>
              </div>
              <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                <div className={`h-full transition-all duration-300 ${hullHealth > 50 ? 'bg-emerald-400' : hullHealth > 20 ? 'bg-amber-400' : 'bg-red-500'}`} style={{ width: `${hullHealth}%` }}></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-[10px] text-slate-400 uppercase font-semibold flex items-center gap-1"><Activity className="w-3 h-3"/> Engine</span>
                <span className="text-[10px] font-mono">{engineHealth.toFixed(0)}%</span>
              </div>
              <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                <div className={`h-full transition-all duration-300 ${engineHealth > 50 ? 'bg-emerald-400' : engineHealth > 20 ? 'bg-amber-400' : 'bg-red-500'}`} style={{ width: `${engineHealth}%` }}></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-[10px] text-slate-400 uppercase font-semibold flex items-center gap-1"><Thermometer className="w-3 h-3"/> Heat</span>
                <span className="text-[10px] font-mono">{engineTemperature.toFixed(0)}°C</span>
              </div>
              <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                <div className={`h-full transition-all duration-300 ${engineTemperature < 80 ? 'bg-sky-400' : engineTemperature < 100 ? 'bg-amber-500' : 'bg-red-600'}`} style={{ width: `${Math.min(100, engineTemperature)}%` }}></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-[10px] text-slate-400 uppercase font-semibold flex items-center gap-1"><Navigation2 className="w-3 h-3"/> Rudder</span>
                <span className="text-[10px] font-mono">{rudderHealth.toFixed(0)}%</span>
              </div>
              <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                <div className={`h-full transition-all duration-300 ${rudderHealth > 50 ? 'bg-emerald-400' : rudderHealth > 20 ? 'bg-amber-400' : 'bg-red-500'}`} style={{ width: `${rudderHealth}%` }}></div>
              </div>
            </div>
            <button 
              onClick={() => {
                // Instantly heal the boat back to 100%
                useSimStore.getState().fireInstantRepair();
              }}
              className="mt-6 w-full py-2 bg-emerald-500/20 hover:bg-emerald-500/40 border border-emerald-500/50 rounded text-emerald-400 text-[10px] font-bold uppercase tracking-wider transition-colors pointer-events-auto cursor-pointer"
            >
              [DEV] Instant Repair
            </button>
          </div>
        </div>

        {/* Right Panel: Force Overrides */}
        <div className="bg-black/50 backdrop-blur-xl border border-white/10 rounded-2xl p-6 text-white w-72 shadow-2xl pointer-events-auto">
          <h2 className="text-sm font-bold text-slate-400 tracking-widest uppercase mb-6 flex items-center gap-2">
             <Wind className="w-4 h-4" /> Physics Engine
          </h2>
          
          <div className="space-y-6">
            {/* Wind Controls */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs text-slate-300 uppercase font-semibold">Wind Speed</span>
                <span className="text-xs font-mono text-sky-300">{windSpeed.toFixed(1)} m/s</span>
              </div>
              <input 
                type="range" min="0" max="60" step="0.1" 
                value={windSpeed} onChange={(e) => setWindSpeed(parseFloat(e.target.value))}
                className="w-full accent-sky-400"
              />
              
              <div className="flex justify-between items-center mt-3 mb-2">
                <span className="text-xs text-slate-300 uppercase font-semibold">Wind Dir</span>
                <span className="text-xs font-mono text-indigo-300">{windDir.toFixed(0)}°</span>
              </div>
              <input 
                type="range" min="0" max="359" step="1" 
                value={windDir} onChange={(e) => setWindDir(parseFloat(e.target.value))}
                className="w-full accent-indigo-400"
              />
            </div>

            <div className="h-px bg-white/10"></div>

            {/* Current Controls */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs text-slate-300 uppercase font-semibold">Current Speed</span>
                <span className="text-xs font-mono text-teal-300">{currentSpeed.toFixed(1)} m/s</span>
              </div>
              <input 
                type="range" min="0" max="10" step="0.1" 
                value={currentSpeed} onChange={(e) => setCurrentSpeed(parseFloat(e.target.value))}
                className="w-full accent-teal-400"
              />
              
              <div className="flex justify-between items-center mt-3 mb-2">
                <span className="text-xs text-slate-300 uppercase font-semibold">Current Dir</span>
                <span className="text-xs font-mono text-teal-300">{currentDir.toFixed(0)}°</span>
              </div>
              <input 
                type="range" min="0" max="359" step="1" 
                value={currentDir} onChange={(e) => setCurrentDir(parseFloat(e.target.value))}
                className="w-full accent-teal-600"
              />
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
