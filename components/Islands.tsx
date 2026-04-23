import { useMemo, useRef } from 'react';
import { PlaneGeometry, BufferAttribute, Color, Mesh, Vector3 } from 'three';
import { useFrame } from '@react-three/fiber';
import { getTerrainHeight } from '@/lib/terrain';
import { sharedPhysics, useSimStore } from '@/store/useSimStore';

export default function Islands() {
  const meshRef = useRef<Mesh>(null);
  
  const geometry = useMemo(() => {
    const size = 3000;
    const segments = 256;
    const geo = new PlaneGeometry(size, size, segments, segments);
    
    // Rotate so it's flat on XZ plane
    geo.rotateX(-Math.PI / 2);
    
    const positions = geo.attributes.position;
    const colors = new Float32Array(positions.count * 3);
    const color = new Color();
    
    const colorSand = new Color('#E1C699');
    const colorGrass = new Color('#4A7023');
    const colorRock = new Color('#5A5A5A');
    const colorSnow = new Color('#FFFFFF');
    
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const z = positions.getZ(i);
      
      const y = getTerrainHeight(x, z);
      positions.setY(i, y);
      
      // Color based on height
      if (y < 2) {
        color.copy(colorSand);
      } else if (y < 20) {
        const factor = (y - 2) / 18;
        color.lerpColors(colorSand, colorGrass, Math.min(1, factor * 2)); // transitions quickly to grass
      } else if (y < 45) {
        const factor = (y - 20) / 25;
        color.lerpColors(colorGrass, colorRock, factor);
      } else {
        const factor = (y - 45) / 15;
        color.lerpColors(colorRock, colorSnow, Math.min(1, factor));
      }
      
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    
    geo.setAttribute('color', new BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    
    return geo;
  }, []);

  useFrame(() => {
    if (meshRef.current) {
      const mat = meshRef.current.material as any;
      if (mat && mat.userData && mat.userData.shader) {
        mat.userData.shader.uniforms.uSeason.value = sharedPhysics.season;
        
        // Feed wind direction down to the fragment shader for snow-drift logic
        const windDirDeg = useSimStore.getState().windDir;
        const windDirRad = windDirDeg * (Math.PI / 180);
        mat.userData.shader.uniforms.uWindDir.value.set(Math.cos(windDirRad), 0, Math.sin(windDirRad)).normalize();
      }
    }
  });

  return (
    <mesh ref={meshRef} geometry={geometry} receiveShadow castShadow>
      <meshStandardMaterial 
        vertexColors 
        roughness={0.8} 
        metalness={0.1} 
        onBeforeCompile={(shader) => {
          shader.uniforms.uSeason = { value: 0 };
          shader.uniforms.uWindDir = { value: new Vector3(1, 0, 0) };
          
          // Inject custom varyings
          shader.vertexShader = `
            uniform float uSeason;
            uniform vec3 uWindDir;
            varying vec3 vIslandWorldPos;
            varying vec3 vIslandWorldNormal;
            varying float vSnowAccumulation;
          ` + shader.vertexShader;
          
          shader.vertexShader = shader.vertexShader.replace(
            `#include <begin_vertex>`,
            `#include <begin_vertex>
            
            vec3 worldSpaceNormal = normalize((modelMatrix * vec4(objectNormal, 0.0)).xyz);
            vec3 worldSpacePos = (modelMatrix * vec4(position, 1.0)).xyz; // original vertex pos
            
            float isWinter = clamp(1.0 - abs(uSeason - 0.75) * 4.0, 0.0, 1.0);
            
            // Large scale noise
            vec2 posXZ = worldSpacePos.xz * 0.02; 
            float snowNoise = sin(posXZ.x) * cos(posXZ.y) * 0.5 + 0.5;
            
            // Fine scale noise
            vec2 microPosXZ = worldSpacePos.xz * 0.15;
            float microSnowNoise = sin(microPosXZ.x + microPosXZ.y) * 0.5 + 0.5;
            
            // Slope steepness mask (Snow collects on flat ground, falls off steep cliffs)
            float slope = dot(worldSpaceNormal, vec3(0.0, 1.0, 0.0));
            float slopeMask = smoothstep(0.65, 0.95, slope); 
            
            // Wind drift mask (Snow collects heavily on leeward/windward edges)
            float windDrift = dot(worldSpaceNormal, normalize(uWindDir));
            float windMask = smoothstep(0.0, 1.0, windDrift); 
            
            vSnowAccumulation = isWinter * clamp(slopeMask + (windMask * 0.6 * slopeMask), 0.0, 1.0) * (snowNoise * 0.6 + microSnowNoise * 0.4);
            
            // Physically Displace the geometry to simulate deep snow piles
            transformed += objectNormal * (vSnowAccumulation * 4.0); // Up to 4 units of snow depth
            `
          );
          
          shader.vertexShader = shader.vertexShader.replace(
            `#include <worldpos_vertex>`,
            `#include <worldpos_vertex>
            vIslandWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
            vIslandWorldNormal = normalize((modelMatrix * vec4(objectNormal, 0.0)).xyz);
            `
          );

          shader.fragmentShader = `
            uniform float uSeason;
            uniform vec3 uWindDir;
            varying vec3 vIslandWorldPos;
            varying vec3 vIslandWorldNormal;
            varying float vSnowAccumulation;
          ` + shader.fragmentShader;
          
          shader.fragmentShader = shader.fragmentShader.replace(
            `#include <color_fragment>`,
            `#include <color_fragment>
            
            // --- Seasonal Foliage & Biome Tinting ---
            // Calculate season masks (Wrap around for Spring 0.0 -> 1.0)
            float sprMask = clamp(1.0 - min(abs(uSeason), abs(uSeason - 1.0)) * 4.0, 0.0, 1.0);
            float sumMask = clamp(1.0 - abs(uSeason - 0.25) * 4.0, 0.0, 1.0);
            float falMask = clamp(1.0 - abs(uSeason - 0.5) * 4.0, 0.0, 1.0);
            float winMask = clamp(1.0 - abs(uSeason - 0.75) * 4.0, 0.0, 1.0);
            
            // Define visual colors for the grass in diff seasons (Ocean Island Ecosystem)
            // Ocean islands typically have wet/dry seasons, not harsh temperate autumns.
            vec3 springFoliage = vec3(0.6, 1.2, 0.5);  // Lush, wet season green
            vec3 summerFoliage = vec3(1.4, 1.3, 0.8);  // High heat summer: scorched, sun-baked, dry yellow-brown
            vec3 fallFoliage = vec3(1.0, 1.1, 0.5);    // Transition, starting to get some moisture back
            vec3 winterFoliage = vec3(0.5, 0.9, 0.4);  // Cooler wet season recovery
            
            // Blend the target foliage color based on current season timeline
            vec3 targetFoliageColor = springFoliage * sprMask + summerFoliage * sumMask + fallFoliage * falMask + winterFoliage * winMask;
            
            // We only want to apply this seasonal change to the GRASS band of the island (y between 2.0 and 20.0), avoiding sand and rock
            // smoothstep creates a smooth gradient mask so it blends naturally into the beach and mountain cliffs
            // In high heat Summer, the scorching effect extends further down into the sand
            float sandScorch = sumMask * smoothstep(0.0, 5.0, vIslandWorldPos.y);
            float foliageMask = smoothstep(2.0, 8.0, vIslandWorldPos.y) * (1.0 - smoothstep(15.0, 24.0, vIslandWorldPos.y));
            
            // Apply the seasonal foliage tint before snow
            diffuseColor.rgb *= mix(vec3(1.0), targetFoliageColor, max(foliageMask, sandScorch * 0.5));
            
            // --- Winter Snow Blanket Override ---
            // Total accumulation map (Computed in vertex shader for displacement consistency)
            vec3 winterCol = vec3(0.92, 0.96, 1.0);
            diffuseColor.rgb = mix(diffuseColor.rgb, winterCol, clamp(vSnowAccumulation * 1.5, 0.0, 1.0));
            `
          );
          
          (meshRef.current?.material as any).userData.shader = shader;
        }}
      />
    </mesh>
  );
}
