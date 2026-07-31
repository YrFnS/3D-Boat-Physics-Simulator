'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { Sky, Stars } from '@react-three/drei';
import { useEffect, useMemo, useRef } from 'react';
import {
  AmbientLight,
  Color,
  DirectionalLight,
  Group,
  Material,
  MathUtils,
  Mesh,
  ShaderMaterial,
} from 'three';
import {
  type RenderQuality,
  sharedPhysics,
  useSimStore,
} from '@/store/useSimStore';

interface ShadowQualityConfig {
  mapSize: number;
  radius: number;
  far: number;
  updateHz: number;
}

const SHADOW_CONFIG: Record<RenderQuality, ShadowQualityConfig> = {
  low: {
    mapSize: 256,
    radius: 22,
    far: 90,
    updateHz: 0,
  },
  medium: {
    mapSize: 768,
    radius: 30,
    far: 140,
    updateHz: 12,
  },
  high: {
    mapSize: 1280,
    radius: 45,
    far: 200,
    updateHz: 20,
  },
  ultra: {
    mapSize: 2048,
    radius: 60,
    far: 280,
    updateHz: 30,
  },
};

const STAR_COUNT: Record<RenderQuality, number> = {
  low: 1200,
  medium: 2500,
  high: 4000,
  ultra: 6000,
};

type TransparentMaterial = Material & {
  opacity: number;
  transparent: boolean;
};

type ManagedShadow = DirectionalLight['shadow'] & {
  autoUpdate: boolean;
  needsUpdate: boolean;
};

export default function EnvironmentRig() {
  const skyRef = useRef<Group>(null);
  const starsRef = useRef<Group>(null);
  const directionalLightRef = useRef<DirectionalLight>(null);
  const ambientLightRef = useRef<AmbientLight>(null);
  const skyMaterialRef = useRef<ShaderMaterial | null>(null);
  const starsMaterialRef = useRef<TransparentMaterial | null>(null);
  const shadowAccumulatorRef = useRef(1);
  const shadowWasEnabledRef = useRef(false);
  const configuredShadowRef = useRef<DirectionalLight | null>(null);
  const renderQuality = useSimStore((state) => state.renderQuality);
  const shadowConfig = SHADOW_CONFIG[renderQuality];
  const { scene } = useThree();

  useEffect(() => {
    starsMaterialRef.current = null;
    configuredShadowRef.current = null;
    shadowAccumulatorRef.current = 1;
  }, [renderQuality]);

  const palette = useMemo(
    () => ({
      daySky: new Color('#aab8c2'),
      nightSky: new Color('#050810'),
      sunsetSky: new Color('#ff9a55'),
      stormDaySky: new Color('#1a2430'),
      stormNightSky: new Color('#020305'),
      heatHaze: new Color('#e8f4fc'),
      dayLight: new Color('#ffffff'),
      sunsetLight: new Color('#ff7e42'),
      nightLight: new Color('#446699'),
      lightning: new Color('#f4f8ff'),
      workingFog: new Color(),
      workingLight: new Color(),
    }),
    [],
  );

  useFrame((state, delta) => {
    const safeDelta = Math.min(delta, 0.1);
    const { camera } = state;
    const store = useSimStore.getState();

    let timeDifference = store.targetTime - sharedPhysics.worldTime;
    if (timeDifference > 12) timeDifference -= 24;
    if (timeDifference < -12) timeDifference += 24;

    const timeSpeed = 2;
    if (Math.abs(timeDifference) < timeSpeed * safeDelta) {
      sharedPhysics.worldTime = store.targetTime;
    } else {
      sharedPhysics.worldTime +=
        Math.sign(timeDifference) * timeSpeed * safeDelta;
    }

    if (sharedPhysics.worldTime < 0) sharedPhysics.worldTime += 24;
    if (sharedPhysics.worldTime >= 24) sharedPhysics.worldTime -= 24;

    let seasonDifference = store.targetSeason - sharedPhysics.season;
    if (seasonDifference > 0.5) seasonDifference -= 1;
    if (seasonDifference < -0.5) seasonDifference += 1;

    const seasonSpeed = 0.15;
    if (Math.abs(seasonDifference) < seasonSpeed * safeDelta) {
      sharedPhysics.season = store.targetSeason;
    } else {
      sharedPhysics.season +=
        Math.sign(seasonDifference) * seasonSpeed * safeDelta;
    }

    if (sharedPhysics.season < 0) sharedPhysics.season += 1;
    if (sharedPhysics.season >= 1) sharedPhysics.season -= 1;

    const elapsed = state.clock.elapsedTime;
    const tornadoStrength = clamp((store.windSpeed - 24) / 18, 0, 1);

    if (tornadoStrength > 0.001) {
      sharedPhysics.tornadoPos.set(
        Math.sin(elapsed * 0.04) * 250,
        0,
        Math.cos(elapsed * 0.04) * 250,
      );
    } else {
      sharedPhysics.tornadoPos.set(1_000_000, 0, 1_000_000);
    }

    sharedPhysics.whirlpoolPos.set(
      -400 + Math.sin(elapsed * 0.01) * 20,
      0,
      -400 + Math.cos(elapsed * 0.01) * 20,
    );

    const summer = clamp(
      1 - Math.abs(sharedPhysics.season - 0.25) * 4,
      0,
      1,
    );
    const winter = clamp(
      1 - Math.abs(sharedPhysics.season - 0.75) * 4,
      0,
      1,
    );

    const maxSunHeight = MathUtils.lerp(500, 1500, summer);
    const sunHeight = MathUtils.lerp(maxSunHeight, 350, winter);
    const timePitch = ((sharedPhysics.worldTime - 6) / 12) * Math.PI;
    const sunX = Math.cos(timePitch) * 1000;
    const sunY = clamp(Math.sin(timePitch) * sunHeight, -100, 1500);
    const sunZ = Math.sin(sharedPhysics.worldTime * 0.5) * 200;

    const isNight =
      sharedPhysics.worldTime < 5 || sharedPhysics.worldTime > 19;
    const dawn = clamp(
      1 - Math.abs(sharedPhysics.worldTime - 6) / 1.5,
      0,
      1,
    );
    const dusk = clamp(
      1 - Math.abs(sharedPhysics.worldTime - 18) / 1.5,
      0,
      1,
    );
    const sunset = Math.max(dawn, dusk);
    const day = clamp(Math.sin(timePitch), 0, 1);
    const storm = clamp((store.windSpeed - 15) / 35, 0, 1);
    const lightning = sharedPhysics.lightningFlash;

    if (scene.fog && 'color' in scene.fog) {
      const fogColor = palette.workingFog.copy(palette.daySky);
      fogColor.lerp(palette.heatHaze, summer * 0.8 * day);
      fogColor.lerp(palette.sunsetSky, sunset);

      if (isNight) {
        fogColor.copy(palette.nightSky);
      } else if (day < 0.2) {
        fogColor.lerp(palette.nightSky, clamp(1 - day / 0.2, 0, 1));
      }

      fogColor.lerp(
        isNight ? palette.stormNightSky : palette.stormDaySky,
        storm,
      );
      fogColor.lerp(palette.lightning, lightning * 0.5);
      scene.fog.color.copy(fogColor);

      if ('near' in scene.fog && 'far' in scene.fog) {
        const heatHazeDistance = summer * 150 * day;
        const winterClarity = winter * 150;
        scene.fog.near = Math.max(
          15,
          200 - storm * 100 - (isNight ? 50 : 0) + winterClarity,
        );
        scene.fog.far = Math.max(
          180,
          1000 -
            Math.pow(storm, 1.5) * 550 -
            (isNight ? 300 : 0) -
            heatHazeDistance +
            winterClarity * 2,
        );
      }
    }

    if (skyRef.current) {
      skyRef.current.position.set(camera.position.x, 0, camera.position.z);

      if (!skyMaterialRef.current) {
        const skyMesh = skyRef.current.children.find(
          (child) => child instanceof Mesh,
        ) as Mesh | undefined;
        if (skyMesh?.material instanceof ShaderMaterial) {
          skyMaterialRef.current = skyMesh.material;
        }
      }

      const skyMaterial = skyMaterialRef.current;
      if (skyMaterial) {
        skyMaterial.uniforms.sunPosition?.value.set(sunX, sunY, sunZ);
        if (skyMaterial.uniforms.turbidity) {
          skyMaterial.uniforms.turbidity.value = MathUtils.lerp(
            0.5,
            12,
            summer,
          );
        }
        if (skyMaterial.uniforms.rayleigh) {
          skyMaterial.uniforms.rayleigh.value =
            MathUtils.lerp(0.8, 2.5, summer) - winter * 0.5;
        }
      }
    }

    if (starsRef.current) {
      starsRef.current.position.set(camera.position.x, 0, camera.position.z);

      if (!starsMaterialRef.current) {
        const starObject = starsRef.current.children[0] as unknown as
          | { material?: TransparentMaterial }
          | undefined;
        if (starObject?.material) {
          starsMaterialRef.current = starObject.material;
        }
      }

      if (starsMaterialRef.current) {
        starsMaterialRef.current.transparent = true;
        starsMaterialRef.current.opacity =
          clamp(1 - day * 2, 0, 1) * (1 - storm);
      }
    }

    const directionalLight = directionalLightRef.current;
    if (directionalLight?.target) {
      const centerX = Number.isFinite(sharedPhysics.boatPos.x)
        ? sharedPhysics.boatPos.x
        : camera.position.x;
      const centerZ = Number.isFinite(sharedPhysics.boatPos.z)
        ? sharedPhysics.boatPos.z
        : camera.position.z;

      directionalLight.position.set(
        centerX + sunX * 0.1,
        Math.max(20, camera.position.y + sunY * 0.1),
        centerZ + sunZ * 0.1,
      );

      const lightColor = palette.workingLight
        .copy(palette.dayLight)
        .lerp(palette.sunsetLight, sunset);

      let lightIntensity: number;
      if (day <= 0) {
        directionalLight.position.set(
          centerX - sunX * 0.1,
          Math.max(30, camera.position.y - sunY * 0.1),
          centerZ - sunZ * 0.1,
        );
        lightColor.copy(palette.nightLight);
        lightIntensity = 0.15;
      } else {
        let seasonalIntensity = MathUtils.lerp(1.5, 1, winter);
        seasonalIntensity = MathUtils.lerp(
          seasonalIntensity,
          3,
          summer,
        );
        lightIntensity = day * seasonalIntensity;
      }

      lightIntensity *= MathUtils.lerp(1, 0.22, Math.pow(storm, 0.8));
      lightIntensity += lightning * 3;
      lightColor.lerp(palette.lightning, lightning);

      directionalLight.intensity = lightIntensity;
      directionalLight.color.copy(lightColor);
      directionalLight.target.position.set(centerX, 0, centerZ);
      directionalLight.target.updateMatrixWorld();

      const shadow = directionalLight.shadow as ManagedShadow;
      if (configuredShadowRef.current !== directionalLight) {
        configuredShadowRef.current = directionalLight;
        shadow.autoUpdate = false;
        shadow.needsUpdate = true;
      }

      const shadowEnabled =
        renderQuality !== 'low' &&
        day > 0.08 &&
        storm < 0.88 &&
        lightning < 0.2 &&
        lightIntensity > 0.12;
      directionalLight.castShadow = shadowEnabled;

      if (shadowEnabled) {
        shadowAccumulatorRef.current += safeDelta;
        const updateInterval = 1 / shadowConfig.updateHz;
        const shouldUpdate =
          !shadowWasEnabledRef.current ||
          shadowAccumulatorRef.current >= updateInterval;
        shadow.needsUpdate = shouldUpdate;
        if (shouldUpdate) {
          shadowAccumulatorRef.current %= updateInterval;
        }
      } else {
        shadowAccumulatorRef.current = 0;
        shadow.needsUpdate = false;
      }
      shadowWasEnabledRef.current = shadowEnabled;
    }

    if (ambientLightRef.current) {
      ambientLightRef.current.intensity =
        MathUtils.lerp(0.3, 0.06, storm) + lightning * 0.5;
      ambientLightRef.current.color
        .copy(isNight ? palette.nightLight : palette.dayLight)
        .lerp(palette.lightning, lightning * 0.8);
    }
  });

  return (
    <group>
      <group ref={skyRef}>
        <Sky sunPosition={[100, 20, 100]} turbidity={0.1} distance={450000} />
      </group>
      <group ref={starsRef} key={`stars-${renderQuality}`}>
        <Stars
          radius={300}
          depth={50}
          count={STAR_COUNT[renderQuality]}
          factor={4}
          saturation={0}
          fade
          speed={1}
        />
      </group>
      <ambientLight ref={ambientLightRef} intensity={0.3} />
      <directionalLight
        key={`directional-light-${renderQuality}`}
        ref={directionalLightRef}
        intensity={1.5}
        castShadow={renderQuality !== 'low'}
        shadow-mapSize={[
          shadowConfig.mapSize,
          shadowConfig.mapSize,
        ]}
        shadow-camera-near={0.5}
        shadow-camera-far={shadowConfig.far}
        shadow-camera-left={-shadowConfig.radius}
        shadow-camera-right={shadowConfig.radius}
        shadow-camera-top={shadowConfig.radius}
        shadow-camera-bottom={-shadowConfig.radius}
        shadow-bias={-0.0002}
        shadow-normalBias={0.035}
      />
    </group>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
