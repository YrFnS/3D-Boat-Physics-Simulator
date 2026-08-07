'use client';

import { useFrame } from '@react-three/fiber';
import { type MutableRefObject, useEffect, useMemo, useRef } from 'react';
import {
  BufferAttribute,
  Color,
  Mesh,
  MeshStandardMaterial,
  BufferGeometry,
  Vector3,
} from 'three';
import {
  getSharedTerrainHeightfield,
  sampleTerrainHeightfield,
} from '@/sim/terrain/TerrainHeightfield';
import { setWorldVectorFromHeading } from '@/sim/world/WorldDirection';
import {
  type RenderQuality,
  sharedPhysics,
  useSimStore,
} from '@/store/useSimStore';

interface IslandQualityConfig {
  snowDetail: number;
  receiveShadow: boolean;
  castTerrainShadows: boolean;
  shadowSearchRadius: number;
  shaderUpdateHz: number;
}

const QUALITY_CONFIG: Record<RenderQuality, IslandQualityConfig> = {
  low: {
    snowDetail: 0.2,
    receiveShadow: false,
    castTerrainShadows: false,
    shadowSearchRadius: 0,
    shaderUpdateHz: 12,
  },
  medium: {
    snowDetail: 0.45,
    receiveShadow: true,
    castTerrainShadows: false,
    shadowSearchRadius: 0,
    shaderUpdateHz: 20,
  },
  high: {
    snowDetail: 0.75,
    receiveShadow: true,
    castTerrainShadows: true,
    shadowSearchRadius: 170,
    shaderUpdateHz: 30,
  },
  ultra: {
    snowDetail: 1,
    receiveShadow: true,
    castTerrainShadows: true,
    shadowSearchRadius: 240,
    shaderUpdateHz: 45,
  },
};

interface IslandShaderRuntime {
  uniforms: Record<string, { value: unknown }>;
  vertexShader: string;
  fragmentShader: string;
}

const COLOR_SAND = new Color('#e1c699');
const COLOR_GRASS = new Color('#4a7023');
const COLOR_ROCK = new Color('#5a5a5a');
const COLOR_SNOW = new Color('#ffffff');

function createTerrainGeometry() {
  const terrain = getSharedTerrainHeightfield();
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    'position',
    new BufferAttribute(terrain.vertices, 3),
  );
  geometry.setIndex(new BufferAttribute(terrain.indices, 1));

  const positions = geometry.attributes.position;
  const colors = new Float32Array(positions.count * 3);
  const workingColor = new Color();

  for (let index = 0; index < positions.count; index += 1) {
    const height = positions.getY(index);

    if (height < 2) {
      workingColor.copy(COLOR_SAND);
    } else if (height < 20) {
      const factor = Math.min(1, ((height - 2) / 18) * 2);
      workingColor.lerpColors(
        COLOR_SAND,
        COLOR_GRASS,
        factor,
      );
    } else if (height < 45) {
      workingColor.lerpColors(
        COLOR_GRASS,
        COLOR_ROCK,
        (height - 20) / 25,
      );
    } else {
      workingColor.lerpColors(
        COLOR_ROCK,
        COLOR_SNOW,
        Math.min(1, (height - 45) / 15),
      );
    }

    const colorOffset = index * 3;
    colors[colorOffset] = workingColor.r;
    colors[colorOffset + 1] = workingColor.g;
    colors[colorOffset + 2] = workingColor.b;
  }

  geometry.setAttribute(
    'color',
    new BufferAttribute(colors, 3),
  );
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function configureIslandShader(
  material: MeshStandardMaterial,
  shaderRef: MutableRefObject<IslandShaderRuntime | null>,
  quality: RenderQuality,
) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSeason = { value: 0 };
    shader.uniforms.uWindDir = { value: new Vector3(1, 0, 0) };
    shader.uniforms.uSnowDetail = {
      value: QUALITY_CONFIG[quality].snowDetail,
    };

    shader.vertexShader = `
      uniform float uSeason;
      uniform vec3 uWindDir;
      uniform float uSnowDetail;
      varying vec3 vIslandWorldPosition;
      varying float vSnowAccumulation;
    ` + shader.vertexShader;

    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      vec3 islandWorldNormal = normalize(
        (modelMatrix * vec4(objectNormal, 0.0)).xyz
      );
      vec3 islandBaseWorldPosition =
        (modelMatrix * vec4(position, 1.0)).xyz;
      float islandWinter = clamp(
        1.0 - abs(uSeason - 0.75) * 4.0,
        0.0,
        1.0
      );
      vec2 islandLargePosition = islandBaseWorldPosition.xz * 0.02;
      float islandSnowNoise =
        sin(islandLargePosition.x) *
        cos(islandLargePosition.y) *
        0.5 + 0.5;
      vec2 islandMicroPosition = islandBaseWorldPosition.xz * 0.15;
      float islandMicroNoise = mix(
        0.5,
        sin(islandMicroPosition.x + islandMicroPosition.y) * 0.5 + 0.5,
        uSnowDetail
      );
      float islandSlope = dot(
        islandWorldNormal,
        vec3(0.0, 1.0, 0.0)
      );
      float islandSlopeMask = smoothstep(0.65, 0.95, islandSlope);
      float islandWindDrift = dot(
        islandWorldNormal,
        normalize(uWindDir)
      );
      float islandWindMask = smoothstep(0.0, 1.0, islandWindDrift);
      vSnowAccumulation =
        islandWinter *
        clamp(
          islandSlopeMask + islandWindMask * 0.6 * islandSlopeMask,
          0.0,
          1.0
        ) *
        (islandSnowNoise * 0.6 + islandMicroNoise * 0.4);
`,
    );

    shader.vertexShader = shader.vertexShader.replace(
      '#include <worldpos_vertex>',
      `#include <worldpos_vertex>
      vIslandWorldPosition =
        (modelMatrix * vec4(transformed, 1.0)).xyz;`,
    );

    shader.fragmentShader = `
      uniform float uSeason;
      varying vec3 vIslandWorldPosition;
      varying float vSnowAccumulation;
    ` + shader.fragmentShader;

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      float islandSpring = clamp(
        1.0 - min(abs(uSeason), abs(uSeason - 1.0)) * 4.0,
        0.0,
        1.0
      );
      float islandSummer = clamp(
        1.0 - abs(uSeason - 0.25) * 4.0,
        0.0,
        1.0
      );
      float islandFall = clamp(
        1.0 - abs(uSeason - 0.5) * 4.0,
        0.0,
        1.0
      );
      float islandWinter = clamp(
        1.0 - abs(uSeason - 0.75) * 4.0,
        0.0,
        1.0
      );
      vec3 islandSpringFoliage = vec3(0.6, 1.2, 0.5);
      vec3 islandSummerFoliage = vec3(1.4, 1.3, 0.8);
      vec3 islandFallFoliage = vec3(1.0, 1.1, 0.5);
      vec3 islandWinterFoliage = vec3(0.5, 0.9, 0.4);
      vec3 islandFoliageColor =
        islandSpringFoliage * islandSpring +
        islandSummerFoliage * islandSummer +
        islandFallFoliage * islandFall +
        islandWinterFoliage * islandWinter;
      float islandSandScorch =
        islandSummer *
        smoothstep(0.0, 5.0, vIslandWorldPosition.y);
      float islandFoliageMask =
        smoothstep(2.0, 8.0, vIslandWorldPosition.y) *
        (1.0 - smoothstep(15.0, 24.0, vIslandWorldPosition.y));
      diffuseColor.rgb *= mix(
        vec3(1.0),
        islandFoliageColor,
        max(islandFoliageMask, islandSandScorch * 0.5)
      );
      vec3 islandWinterColor = vec3(0.92, 0.96, 1.0);
      diffuseColor.rgb = mix(
        diffuseColor.rgb,
        islandWinterColor,
        clamp(vSnowAccumulation * 1.5, 0.0, 1.0)
      );`,
    );

    shaderRef.current = shader as IslandShaderRuntime;
  };

  material.customProgramCacheKey = () => `island-material-${quality}`;
  material.needsUpdate = true;
}

function hasNearbyLand(centerX: number, centerZ: number, radius: number) {
  if (sampleTerrainHeightfield(centerX, centerZ) > -10) return true;

  for (let index = 0; index < 8; index += 1) {
    const angle = (index / 8) * Math.PI * 2;
    const x = centerX + Math.cos(angle) * radius;
    const z = centerZ + Math.sin(angle) * radius;
    if (sampleTerrainHeightfield(x, z) > -10) return true;
  }

  return false;
}

export default function Islands() {
  const meshRef = useRef<Mesh>(null);
  const shaderRef = useRef<IslandShaderRuntime | null>(null);
  const shaderAccumulatorRef = useRef(0);
  const shadowAccumulatorRef = useRef(1);
  const renderQuality = useSimStore((state) => state.renderQuality);
  const config = QUALITY_CONFIG[renderQuality];

  const geometry = useMemo(() => createTerrainGeometry(), []);
  const material = useMemo(() => {
    const nextMaterial = new MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.8,
      metalness: 0.1,
    });
    configureIslandShader(nextMaterial, shaderRef, renderQuality);
    return nextMaterial;
  }, [renderQuality]);

  useEffect(
    () => () => {
      geometry.dispose();
    },
    [geometry],
  );

  useEffect(
    () => () => {
      if (shaderRef.current) shaderRef.current = null;
      material.dispose();
    },
    [material],
  );

  useFrame((_, delta) => {
    const safeDelta = Math.min(delta, 0.1);
    shaderAccumulatorRef.current += safeDelta;
    shadowAccumulatorRef.current += safeDelta;

    const shaderInterval = 1 / config.shaderUpdateHz;
    if (shaderAccumulatorRef.current >= shaderInterval) {
      shaderAccumulatorRef.current %= shaderInterval;
      const shader = shaderRef.current;
      if (shader) {
        shader.uniforms.uSeason.value = sharedPhysics.season;
        shader.uniforms.uSnowDetail.value = config.snowDetail;

        const uniform = shader.uniforms.uWindDir.value as Vector3;
        setWorldVectorFromHeading(
          uniform,
          useSimStore.getState().windDir,
        );
      }
    }

    if (shadowAccumulatorRef.current < 0.5) return;
    shadowAccumulatorRef.current %= 0.5;

    const mesh = meshRef.current;
    if (!mesh) return;

    const store = useSimStore.getState();
    const daylight =
      sharedPhysics.worldTime > 5.5 && sharedPhysics.worldTime < 18.5;
    const shadowsUseful = daylight && store.windSpeed < 46;
    const nearbyLand =
      config.castTerrainShadows &&
      hasNearbyLand(
        sharedPhysics.boatPos.x,
        sharedPhysics.boatPos.z,
        config.shadowSearchRadius,
      );

    mesh.castShadow =
      config.castTerrainShadows && shadowsUseful && nearbyLand;
    mesh.receiveShadow = config.receiveShadow;
  });

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      material={material}
      castShadow={false}
      receiveShadow={config.receiveShadow}
      userData={{ shadowBudgetMode: 'terrain' }}
    />
  );
}
