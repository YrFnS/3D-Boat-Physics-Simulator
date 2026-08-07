'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { canAdvanceAuthoritativeSimulation } from '@/sim/core/SimulationRuntimeAuthority';
import { useEffect, useMemo, useRef } from 'react';
import {
  ClampToEdgeWrapping,
  LinearFilter,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  Texture,
  Vector2,
  WebGLRenderTarget,
} from 'three';
import {
  type RenderQuality,
  sharedPhysics,
  useSimStore,
} from '@/store/useSimStore';

interface WakeQualityConfig {
  resolution: number;
  worldSize: number;
  lifetime: number;
  diffusion: number;
  updateHz: number;
}

const QUALITY_CONFIG: Record<RenderQuality, WakeQualityConfig> = {
  low: {
    resolution: 128,
    worldSize: 420,
    lifetime: 7,
    diffusion: 0.2,
    updateHz: 30,
  },
  medium: {
    resolution: 192,
    worldSize: 460,
    lifetime: 9,
    diffusion: 0.17,
    updateHz: 45,
  },
  high: {
    resolution: 256,
    worldSize: 500,
    lifetime: 11,
    diffusion: 0.14,
    updateHz: 60,
  },
  ultra: {
    resolution: 384,
    worldSize: 540,
    lifetime: 13,
    diffusion: 0.12,
    updateHz: 60,
  },
};

export const sharedWakeField: {
  texture: Texture | null;
  origin: Vector2;
  worldSize: number;
  resolution: number;
} = {
  texture: null,
  origin: new Vector2(),
  worldSize: QUALITY_CONFIG.high.worldSize,
  resolution: QUALITY_CONFIG.high.resolution,
};

const vertexShader = `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const fragmentShader = `
precision highp float;

uniform sampler2D tPrevious;
uniform float uDelta;
uniform float uTime;
uniform float uWorldSize;
uniform float uTexelSize;
uniform float uLifetime;
uniform float uDiffusion;
uniform float uBoatSpeed;
uniform float uReset;
uniform vec2 uPreviousOrigin;
uniform vec2 uCurrentOrigin;
uniform vec2 uBoatPosition;
uniform vec2 uBoatDirection;

varying vec2 vUv;

float cross2d(vec2 a, vec2 b) {
  return a.x * b.y - a.y * b.x;
}

float previousWake(vec2 uv) {
  if (
    uv.x <= 0.0 || uv.x >= 1.0 ||
    uv.y <= 0.0 || uv.y >= 1.0
  ) {
    return 0.0;
  }

  vec2 texelX = vec2(uTexelSize, 0.0);
  vec2 texelY = vec2(0.0, uTexelSize);
  float center = texture2D(tPrevious, uv).r;
  float blurred = (
    center * 4.0 +
    texture2D(tPrevious, uv + texelX).r +
    texture2D(tPrevious, uv - texelX).r +
    texture2D(tPrevious, uv + texelY).r +
    texture2D(tPrevious, uv - texelY).r
  ) / 8.0;

  return mix(center, blurred, uDiffusion);
}

void main() {
  vec2 worldPosition =
    uCurrentOrigin + (vUv - 0.5) * uWorldSize;
  vec2 previousUv =
    (worldPosition - uPreviousOrigin) / uWorldSize + 0.5;

  float history = 0.0;
  if (uReset < 0.5) {
    history = previousWake(previousUv);
  }
  history *= exp(-uDelta / max(uLifetime, 0.001));

  vec2 direction = normalize(uBoatDirection + vec2(0.0001));
  vec2 sternDirection = -direction;
  vec2 boatDelta = worldPosition - uBoatPosition;
  float behind = dot(boatDelta, sternDirection);
  float lateral = abs(cross2d(boatDelta, sternDirection));
  float speedStrength = clamp((uBoatSpeed - 1.0) / 13.0, 0.0, 1.0);

  float localTrail =
    step(0.0, behind) *
    (1.0 - smoothstep(28.0, 42.0, behind));
  float armOffset = max(1.0, behind * 0.34);
  float armThickness = mix(
    0.75,
    2.8,
    clamp(behind / 36.0, 0.0, 1.0)
  );
  float arms = 1.0 - smoothstep(
    armThickness,
    armThickness * 2.2,
    abs(lateral - armOffset)
  );
  float pulse = 0.68 + 0.32 * sin(behind * 0.62 - uTime * 3.2);
  float centerWash =
    (1.0 - smoothstep(0.0, 1.8 + behind * 0.12, lateral)) *
    (1.0 - smoothstep(12.0, 34.0, behind)) *
    0.55;
  float propWash =
    step(0.0, behind) *
    (1.0 - smoothstep(0.0, 18.0, behind)) *
    (1.0 - smoothstep(0.0, 2.2 + behind * 0.1, lateral));

  float generated = max(
    (arms * pulse + centerWash) * localTrail,
    propWash
  );
  generated *= speedStrength;

  float wake = max(history, generated);
  gl_FragColor = vec4(wake, wake, wake, 1.0);
}
`;

function configureTarget(target: WebGLRenderTarget) {
  target.texture.minFilter = LinearFilter;
  target.texture.magFilter = LinearFilter;
  target.texture.wrapS = ClampToEdgeWrapping;
  target.texture.wrapT = ClampToEdgeWrapping;
  target.texture.generateMipmaps = false;
}

function createResources(config: WakeQualityConfig) {
  const targetOptions = {
    format: RGBAFormat,
    depthBuffer: false,
    stencilBuffer: false,
  };
  const first = new WebGLRenderTarget(
    config.resolution,
    config.resolution,
    targetOptions,
  );
  const second = new WebGLRenderTarget(
    config.resolution,
    config.resolution,
    targetOptions,
  );
  configureTarget(first);
  configureTarget(second);

  const geometry = new PlaneGeometry(2, 2);
  const material = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      tPrevious: { value: first.texture },
      uDelta: { value: 0 },
      uTime: { value: 0 },
      uWorldSize: { value: config.worldSize },
      uTexelSize: { value: 1 / config.resolution },
      uLifetime: { value: config.lifetime },
      uDiffusion: { value: config.diffusion },
      uBoatSpeed: { value: 0 },
      uReset: { value: 1 },
      uPreviousOrigin: { value: new Vector2() },
      uCurrentOrigin: { value: new Vector2() },
      uBoatPosition: { value: new Vector2() },
      uBoatDirection: { value: new Vector2(0, -1) },
    },
  });
  const quad = new Mesh(geometry, material);
  quad.frustumCulled = false;

  const scene = new Scene();
  scene.add(quad);
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

  return {
    first,
    second,
    geometry,
    material,
    scene,
    camera,
  };
}

export default function WakeField() {
  const { gl } = useThree();
  const renderQuality = useSimStore((state) => state.renderQuality);
  const config = QUALITY_CONFIG[renderQuality];
  const resources = useMemo(
    () => createResources(config),
    [config],
  );

  const targetsRef = useRef({
    read: resources.first,
    write: resources.second,
  });
  const previousOriginRef = useRef(new Vector2());
  const currentOriginRef = useRef(new Vector2());
  const initializedRef = useRef(false);
  const updateAccumulatorRef = useRef(0);

  useEffect(() => {
    targetsRef.current.read = resources.first;
    targetsRef.current.write = resources.second;
    initializedRef.current = false;
    updateAccumulatorRef.current = 0;
    sharedWakeField.texture = null;
    sharedWakeField.worldSize = config.worldSize;
    sharedWakeField.resolution = config.resolution;

    return () => {
      if (
        sharedWakeField.texture === resources.first.texture ||
        sharedWakeField.texture === resources.second.texture
      ) {
        sharedWakeField.texture = null;
      }
      resources.geometry.dispose();
      resources.material.dispose();
      resources.first.dispose();
      resources.second.dispose();
    };
  }, [config, resources]);

  useFrame((_, delta) => {
    const sessionPhase = useSimStore.getState().sessionPhase;
    if (!canAdvanceAuthoritativeSimulation(sessionPhase)) {
      updateAccumulatorRef.current = 0;
      if (sessionPhase === 'menu') {
        initializedRef.current = false;
        sharedWakeField.texture = null;
      }
      return;
    }

    const safeDelta = Math.min(delta, 0.1);
    updateAccumulatorRef.current += safeDelta;
    const updateInterval = 1 / config.updateHz;
    if (updateAccumulatorRef.current + 1e-6 < updateInterval) return;

    const simulationDelta = Math.min(updateAccumulatorRef.current, 0.1);
    updateAccumulatorRef.current %= updateInterval;

    if (
      !Number.isFinite(sharedPhysics.boatPos.x) ||
      !Number.isFinite(sharedPhysics.boatPos.z)
    ) {
      return;
    }

    const snap = 4;
    const currentOrigin = currentOriginRef.current.set(
      Math.round(sharedPhysics.boatPos.x / snap) * snap,
      Math.round(sharedPhysics.boatPos.z / snap) * snap,
    );
    const previousOrigin = previousOriginRef.current;
    const mustReset =
      !initializedRef.current ||
      previousOrigin.distanceTo(currentOrigin) > config.worldSize * 0.45;

    if (!initializedRef.current) {
      previousOrigin.copy(currentOrigin);
    }

    const targets = targetsRef.current;
    const uniforms = resources.material.uniforms;
    uniforms.tPrevious.value = targets.read.texture;
    uniforms.uDelta.value = simulationDelta;
    uniforms.uTime.value = sharedPhysics.renderTime;
    uniforms.uWorldSize.value = config.worldSize;
    uniforms.uTexelSize.value = 1 / config.resolution;
    uniforms.uLifetime.value = config.lifetime;
    uniforms.uDiffusion.value = config.diffusion;
    uniforms.uBoatSpeed.value = sharedPhysics.boatSpeed;
    uniforms.uReset.value = mustReset ? 1 : 0;
    uniforms.uPreviousOrigin.value.copy(previousOrigin);
    uniforms.uCurrentOrigin.value.copy(currentOrigin);
    uniforms.uBoatPosition.value.set(
      sharedPhysics.boatPos.x,
      sharedPhysics.boatPos.z,
    );
    uniforms.uBoatDirection.value.set(
      sharedPhysics.boatDir.x,
      sharedPhysics.boatDir.z,
    );

    const previousRenderTarget = gl.getRenderTarget();
    gl.setRenderTarget(targets.write);
    gl.render(resources.scene, resources.camera);
    gl.setRenderTarget(previousRenderTarget);

    const oldRead = targets.read;
    targets.read = targets.write;
    targets.write = oldRead;

    previousOrigin.copy(currentOrigin);
    initializedRef.current = true;
    sharedWakeField.texture = targets.read.texture;
    sharedWakeField.origin.copy(currentOrigin);
    sharedWakeField.worldSize = config.worldSize;
    sharedWakeField.resolution = config.resolution;
  }, -50);

  return null;
}
