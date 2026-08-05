'use client';

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  BufferAttribute,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  MathUtils,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  Vector2,
  Vector3,
} from 'three';
import {
  type RenderQuality,
  sharedPhysics,
  useSimStore,
} from '@/store/useSimStore';
import { canAdvanceAuthoritativeSimulation } from '@/sim/core/SimulationRuntimeAuthority';
import { setWorldXZFromHeading } from '@/sim/world/WorldDirection';

const MAX_RAIN = 12_000;

const RAIN_COUNT_BY_QUALITY: Record<RenderQuality, number> = {
  low: 2_500,
  medium: 5_000,
  high: 8_000,
  ultra: MAX_RAIN,
};

const rainVertexShader = `
attribute vec4 aSeed;

uniform float uTime;
uniform float uStormIntensity;
uniform float uSnowBlend;
uniform vec3 uCameraPosition;
uniform vec2 uWind;
uniform float uArea;
uniform float uHeight;

varying vec2 vUv;
varying float vAlpha;

#include <fog_pars_vertex>

float hash11(float value) {
  return fract(sin(value) * 43758.5453123);
}

float wrapRange(float value, float size) {
  return mod(value + size * 0.5, size) - size * 0.5;
}

void main() {
  vUv = uv;

  float densityTarget = pow(uStormIntensity, 1.35);
  float enabled = smoothstep(aSeed.w - 0.05, aSeed.w + 0.02, densityTarget);

  if (enabled < 0.001) {
    vAlpha = 0.0;
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }

  float randomSpeed = hash11(aSeed.x * 97.0 + aSeed.z * 211.0);
  float rainFallSpeed =
    mix(16.0, 34.0, randomSpeed) * mix(1.0, 1.7, uStormIntensity);
  float snowFallSpeed = mix(2.2, 6.5, randomSpeed);
  float fallSpeed = mix(rainFallSpeed, snowFallSpeed, uSnowBlend);
  float cycle = mod(uTime * fallSpeed + aSeed.y * uHeight, uHeight);
  float localY = uHeight * 0.5 - cycle;
  float fallAge = cycle / max(fallSpeed, 0.001);

  vec2 localXZ = vec2(
    (aSeed.x - 0.5) * uArea,
    (aSeed.z - 0.5) * uArea
  );
  localXZ += uWind * fallAge * mix(1.0, 1.45, uSnowBlend);
  localXZ.x = wrapRange(localXZ.x, uArea);
  localXZ.y = wrapRange(localXZ.y, uArea);

  vec3 worldPosition = uCameraPosition + vec3(localXZ.x, localY, localXZ.y);
  vec4 mvPosition = viewMatrix * vec4(worldPosition, 1.0);

  vec3 viewVelocity = mat3(viewMatrix) * vec3(uWind.x, -fallSpeed, uWind.y);
  vec2 streakDirection = normalize(viewVelocity.xy + vec2(0.0001));
  vec2 streakSide = vec2(-streakDirection.y, streakDirection.x);

  float rainWidth = mix(0.01, 0.035, uStormIntensity);
  float rainLength = mix(0.28, 1.25, uStormIntensity);
  float snowSize = mix(0.07, 0.16, uStormIntensity);
  float streakWidth = mix(rainWidth, snowSize, uSnowBlend);
  float streakLength = mix(rainLength, snowSize, uSnowBlend);
  mvPosition.xy +=
    streakSide * position.x * streakWidth +
    streakDirection * position.y * streakLength;

  gl_Position = projectionMatrix * mvPosition;
  vAlpha = enabled * mix(0.25, 0.65, uStormIntensity);

  #include <fog_vertex>
}
`;

const rainFragmentShader = `
precision highp float;

uniform float uSnowBlend;

varying vec2 vUv;
varying float vAlpha;

#include <fog_pars_fragment>

void main() {
  float across = 1.0 - smoothstep(0.28, 0.5, abs(vUv.x - 0.5));
  float headFade = smoothstep(0.0, 0.15, vUv.y);
  float tailFade = 1.0 - smoothstep(0.72, 1.0, vUv.y);
  float rainAlpha = across * headFade * tailFade;
  float snowAlpha =
    1.0 - smoothstep(0.24, 0.5, length(vUv - vec2(0.5)));
  float alpha = mix(rainAlpha, snowAlpha, uSnowBlend) * vAlpha;

  if (alpha < 0.01) discard;

  vec3 rainColor = mix(
    vec3(0.55, 0.72, 0.86),
    vec3(0.92, 0.97, 1.0),
    vUv.y
  );
  vec3 snowColor = vec3(0.94, 0.98, 1.0);
  gl_FragColor = vec4(mix(rainColor, snowColor, uSnowBlend), alpha);

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

function seededRandom(seed = 73_421) {
  let currentSeed = seed;
  return () => {
    currentSeed = (currentSeed * 16_807) % 2_147_483_647;
    return (currentSeed - 1) / 2_147_483_646;
  };
}

function createRainGeometry() {
  const geometry = new InstancedBufferGeometry();

  geometry.setAttribute(
    'position',
    new BufferAttribute(
      new Float32Array([
        -1, -1, 0,
        1, -1, 0,
        1, 1, 0,
        -1, 1, 0,
      ]),
      3,
    ),
  );
  geometry.setAttribute(
    'uv',
    new BufferAttribute(
      new Float32Array([
        0, 0,
        1, 0,
        1, 1,
        0, 1,
      ]),
      2,
    ),
  );
  geometry.setIndex(
    new BufferAttribute(new Uint16Array([0, 1, 2, 0, 2, 3]), 1),
  );

  const random = seededRandom();
  const seeds = new Float32Array(MAX_RAIN * 4);
  for (let index = 0; index < MAX_RAIN; index += 1) {
    const offset = index * 4;
    seeds[offset] = random();
    seeds[offset + 1] = random();
    seeds[offset + 2] = random();
    seeds[offset + 3] = random();
  }

  geometry.setAttribute('aSeed', new InstancedBufferAttribute(seeds, 4));
  geometry.instanceCount = RAIN_COUNT_BY_QUALITY.high;
  geometry.computeBoundingSphere();

  return geometry;
}

export default function WeatherEffects() {
  const sessionPhase = useSimStore((state) => state.sessionPhase);
  const audioContextRef = useRef<AudioContext | null>(null);
  const windGainRef = useRef<GainNode | null>(null);
  const windFilterRef = useRef<BiquadFilterNode | null>(null);
  const windPannerRef = useRef<PannerNode | null>(null);
  const thunderFilterRef = useRef<BiquadFilterNode | null>(null);
  const rumbleGainRef = useRef<GainNode | null>(null);
  const lightningFlashRef = useRef(0);
  const precipitationTimeRef = useRef(0);
  const precipitationWindRef = useRef(new Vector2());
  const windSourceOffsetRef = useRef(new Vector2());
  const cameraDirection = useRef(new Vector3());
  const cameraUp = useRef(new Vector3());

  const rainGeometry = useMemo(() => createRainGeometry(), []);
  const rainMaterial = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: rainVertexShader,
        fragmentShader: rainFragmentShader,
        uniforms: UniformsUtils.merge([
          UniformsLib.fog,
          {
            uTime: { value: 0 },
            uStormIntensity: { value: 0 },
            uSnowBlend: { value: 0 },
            uCameraPosition: { value: new Vector3() },
            uWind: { value: new Vector2() },
            uArea: { value: 90 },
            uHeight: { value: 55 },
          },
        ]),
        transparent: true,
        depthWrite: false,
        fog: true,
      }),
    [],
  );

  useEffect(
    () => () => {
      rainGeometry.dispose();
      rainMaterial.dispose();
    },
    [rainGeometry, rainMaterial],
  );

  useEffect(() => {
    const initializeAudio = () => {
      if (audioContextRef.current) {
        if (audioContextRef.current.state === 'suspended') {
          void audioContextRef.current.resume();
        }
        return;
      }

      const AudioContextConstructor =
        window.AudioContext ||
        (window as typeof window & {
          webkitAudioContext?: typeof AudioContext;
        }).webkitAudioContext;

      if (!AudioContextConstructor) return;

      const context = new AudioContextConstructor();
      audioContextRef.current = context;

      const bufferSize = context.sampleRate * 2;
      const noiseBuffer = context.createBuffer(1, bufferSize, context.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let index = 0; index < bufferSize; index += 1) {
        output[index] = Math.random() * 2 - 1;
      }

      const windSource = context.createBufferSource();
      windSource.buffer = noiseBuffer;
      windSource.loop = true;

      const windFilter = context.createBiquadFilter();
      windFilter.type = 'lowpass';
      windFilter.frequency.value = 100;
      windFilter.Q.value = 1.2;

      const windGain = context.createGain();
      windGain.gain.value = 0;

      const windPanner = context.createPanner();
      windPanner.panningModel = 'HRTF';
      windPanner.distanceModel = 'linear';
      windPanner.refDistance = 1000;
      windPanner.maxDistance = 10_000;

      windSource.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(windPanner);
      windPanner.connect(context.destination);
      windSource.start();

      windFilterRef.current = windFilter;
      windGainRef.current = windGain;
      windPannerRef.current = windPanner;

      const thunderSource = context.createBufferSource();
      thunderSource.buffer = noiseBuffer;
      thunderSource.loop = true;

      const thunderFilter = context.createBiquadFilter();
      thunderFilter.type = 'lowpass';
      thunderFilter.frequency.value = 100;
      thunderFilter.Q.value = 2;

      const rumbleGain = context.createGain();
      rumbleGain.gain.value = 0;

      thunderSource.connect(thunderFilter);
      thunderFilter.connect(rumbleGain);
      rumbleGain.connect(context.destination);
      thunderSource.start();

      thunderFilterRef.current = thunderFilter;
      rumbleGainRef.current = rumbleGain;
    };

    window.addEventListener('pointerdown', initializeAudio);
    window.addEventListener('keydown', initializeAudio);

    return () => {
      window.removeEventListener('pointerdown', initializeAudio);
      window.removeEventListener('keydown', initializeAudio);
      if (audioContextRef.current) {
        void audioContextRef.current.close();
      }
    };
  }, []);

  useEffect(() => {
    if (sessionPhase === 'running') return;

    const context = audioContextRef.current;
    if (!context || context.state === 'closed') return;
    const now = context.currentTime;
    windGainRef.current?.gain.cancelScheduledValues(now);
    windGainRef.current?.gain.setTargetAtTime(0, now, 0.05);
    rumbleGainRef.current?.gain.cancelScheduledValues(now);
    rumbleGainRef.current?.gain.setTargetAtTime(0, now, 0.05);

    if (sessionPhase === 'menu') {
      lightningFlashRef.current = 0;
      sharedPhysics.lightningFlash = 0;
    }
  }, [sessionPhase]);

  useFrame((state, delta) => {
    const store = useSimStore.getState();
    const simulationRunning = canAdvanceAuthoritativeSimulation(
      store.sessionPhase,
    );
    const simulationDelta = simulationRunning
      ? Math.min(delta, 0.1)
      : 0;
    const { windSpeed, windDir, renderQuality } = store;
    const stormIntensity = MathUtils.clamp((windSpeed - 15) / 35, 0, 1);
    const winter = MathUtils.clamp(
      1 - Math.abs(sharedPhysics.season - 0.75) * 4,
      0,
      1,
    );
    const snowBlend =
      winter * MathUtils.clamp((windSpeed + 2) / 20, 0.15, 1);
    const precipitationIntensity = Math.max(
      stormIntensity,
      snowBlend * MathUtils.clamp(windSpeed / 22, 0.18, 0.72),
    );
    precipitationTimeRef.current += simulationDelta;
    setWorldXZFromHeading(
      precipitationWindRef.current,
      windDir,
      windSpeed * MathUtils.lerp(0.4, 0.62, snowBlend),
    );

    rainGeometry.instanceCount = RAIN_COUNT_BY_QUALITY[renderQuality];
    rainMaterial.uniforms.uTime.value = precipitationTimeRef.current;
    rainMaterial.uniforms.uStormIntensity.value = precipitationIntensity;
    rainMaterial.uniforms.uSnowBlend.value = snowBlend;
    rainMaterial.uniforms.uCameraPosition.value.copy(state.camera.position);
    rainMaterial.uniforms.uWind.value.copy(precipitationWindRef.current);

    const strikesPerSecond =
      MathUtils.lerp(0.02, 0.9, stormIntensity) * stormIntensity;
    const strikeProbability = 1 - Math.exp(-strikesPerSecond * simulationDelta);

    if (
      stormIntensity > 0.1 &&
      lightningFlashRef.current <= 0 &&
      Math.random() < strikeProbability
    ) {
      lightningFlashRef.current = 1;

      const context = audioContextRef.current;
      const rumbleGain = rumbleGainRef.current;
      const thunderFilter = thunderFilterRef.current;
      if (context && rumbleGain && thunderFilter) {
        const now = context.currentTime;
        rumbleGain.gain.cancelScheduledValues(now);
        rumbleGain.gain.setValueAtTime(0.0001, now);
        rumbleGain.gain.linearRampToValueAtTime(1.2, now + 0.08);
        rumbleGain.gain.exponentialRampToValueAtTime(0.01, now + 5);

        thunderFilter.frequency.cancelScheduledValues(now);
        thunderFilter.frequency.setValueAtTime(800, now);
        thunderFilter.frequency.exponentialRampToValueAtTime(40, now + 4);
      }
    }

    lightningFlashRef.current = Math.max(
      0,
      lightningFlashRef.current - simulationDelta * 3,
    );
    sharedPhysics.lightningFlash = lightningFlashRef.current;

    const context = audioContextRef.current;
    const windGain = windGainRef.current;
    const windFilter = windFilterRef.current;
    const windPanner = windPannerRef.current;

    if (
      context?.state === 'running' &&
      windGain &&
      windFilter &&
      windPanner
    ) {
      const now = context.currentTime;
      windGain.gain.setTargetAtTime(
        simulationRunning
          ? MathUtils.clamp(stormIntensity * 0.7, 0, 0.7)
          : 0,
        now,
        0.5,
      );
      windFilter.frequency.setTargetAtTime(100 + windSpeed * 12, now, 0.2);

      const listener = context.listener;
      const cameraPosition = state.camera.position;
      if (listener.positionX) {
        listener.positionX.setTargetAtTime(cameraPosition.x, now, 0.1);
        listener.positionY.setTargetAtTime(cameraPosition.y, now, 0.1);
        listener.positionZ.setTargetAtTime(cameraPosition.z, now, 0.1);

        cameraDirection.current
          .set(0, 0, -1)
          .applyQuaternion(state.camera.quaternion);
        cameraUp.current
          .set(0, 1, 0)
          .applyQuaternion(state.camera.quaternion);

        listener.forwardX.setTargetAtTime(cameraDirection.current.x, now, 0.1);
        listener.forwardY.setTargetAtTime(cameraDirection.current.y, now, 0.1);
        listener.forwardZ.setTargetAtTime(cameraDirection.current.z, now, 0.1);
        listener.upX.setTargetAtTime(cameraUp.current.x, now, 0.1);
        listener.upY.setTargetAtTime(cameraUp.current.y, now, 0.1);
        listener.upZ.setTargetAtTime(cameraUp.current.z, now, 0.1);
      }

      const pannerDistance = 50;
      setWorldXZFromHeading(
        windSourceOffsetRef.current,
        windDir,
        pannerDistance,
      );
      if (windPanner.positionX) {
        windPanner.positionX.setTargetAtTime(
          cameraPosition.x - windSourceOffsetRef.current.x,
          now,
          0.1,
        );
        windPanner.positionY.setTargetAtTime(cameraPosition.y, now, 0.1);
        windPanner.positionZ.setTargetAtTime(
          cameraPosition.z - windSourceOffsetRef.current.y,
          now,
          0.1,
        );
      }
    }
  });

  return (
    <mesh
      geometry={rainGeometry}
      material={rainMaterial}
      frustumCulled={false}
      renderOrder={20}
    />
  );
}
