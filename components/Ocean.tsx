'use client';

import { useMemo, useRef } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { Vector2, Vector3, Vector4, Color, ShaderMaterial, Mesh, TextureLoader, RepeatWrapping, MathUtils, UniformsLib, UniformsUtils, DataTexture, RGBAFormat, UnsignedByteType, LinearFilter } from 'three';
import { useSimStore, sharedPhysics, MAX_WAKE_NODES } from '@/store/useSimStore';
import { getTerrainHeight } from '@/lib/terrain';

const vertexShader = `
#define WAKE_NODES ${MAX_WAKE_NODES}

uniform float uTime;
uniform vec4 uWaves[4];

// Kelvin Wake
uniform vec3 uBoatPos;
uniform vec3 uBoatDir;
uniform float uBoatSpeed;
uniform float uAbsoluteOdometer;

uniform vec4 uWakeNodes[WAKE_NODES];
uniform vec4 uWakeDirs[WAKE_NODES];
uniform vec3 uWhirlpoolPos;
uniform sampler2D tDampening;
uniform float uSeason;

varying vec3 vWorldPosition;
varying float vFoam;
varying vec3 vNormal;
varying float vWakeFoam;
varying float vIce;

#include <fog_pars_vertex>

vec3 getGerstnerWave(vec4 wave, vec3 p, inout vec3 tangent, inout vec3 binormal, inout float dxdx, inout float dzdz, inout float dxdz, inout float dzdx) {
    float steepness = wave.z;
    float wavelength = wave.w;
    
    // Wave parameters
    float k = 2.0 * 3.14159 / wavelength;
    float c = sqrt(9.8 / k);
    vec2 d = normalize(wave.xy);
    
    // Calculate phase based on WORLD space p.xz
    float f = k * (dot(d, p.xz) - c * uTime);
    float a = steepness / k;
    
    float cosf = cos(f);
    float sinf = sin(f);
    
    // Position offsets
    vec3 result;
    result.x = d.x * (a * cosf) * 0.4; // Reduced horizontal sliding against terrain
    result.y = a * sinf;
    result.z = d.y * (a * cosf) * 0.4; // Reduced horizontal sliding against terrain
    
    // Derivatives for normal
    float wa = k * a;
    tangent.x -= d.x * d.x * (wa * sinf);
    tangent.y += d.x * (wa * cosf);
    tangent.z -= d.x * d.y * (wa * sinf);
    
    binormal.x -= d.x * d.y * (wa * sinf);
    binormal.y += d.y * (wa * cosf);
    binormal.z -= d.y * d.y * (wa * sinf);
    
    // Derivatives for Jacobian (Foam)
    dxdx -= d.x * d.x * (wa * sinf);
    dzdz -= d.y * d.y * (wa * sinf);
    dxdz -= d.x * d.y * (wa * sinf);
    dzdx -= d.x * d.y * (wa * sinf);
    
    return result;
}

void main() {
    // Obtain true world position BEFORE wave offset
    vec4 worldPosData = modelMatrix * vec4(position, 1.0);
    vec3 p = worldPosData.xyz;
    
    vec3 tangent = vec3(1.0, 0.0, 0.0);
    vec3 binormal = vec3(0.0, 0.0, 1.0);
    
    float dxdx = 0.0;
    float dzdz = 0.0;
    float dxdz = 0.0;
    float dzdx = 0.0;
    
    // 1. Vortex Displacement (Sucking the ocean down)
    vec2 vDelta = p.xz - uWhirlpoolPos.xz;
    float vDist = length(vDelta);
    float vFactor = smoothstep(160.0, 0.0, vDist); // Wider influence
    
    // Maelstrom shape: A beautiful, extreme smooth funnel (Rankine-style depression)
    float vortexSink = pow(vFactor, 3.0) * 80.0;
    
    // Accumulate waves
    vec3 offset = vec3(0.0);
    offset += getGerstnerWave(uWaves[0], p, tangent, binormal, dxdx, dzdz, dxdz, dzdx);
    offset += getGerstnerWave(uWaves[1], p, tangent, binormal, dxdx, dzdz, dxdz, dzdx);
    offset += getGerstnerWave(uWaves[2], p, tangent, binormal, dxdx, dzdz, dxdz, dzdx);
    offset += getGerstnerWave(uWaves[3], p, tangent, binormal, dxdx, dzdz, dxdz, dzdx);
    
    // Whirlpool damping
    float whirlpoolDamp = 1.0 - smoothstep(0.0, 120.0, vDist);
    
    // Dampen wave amplitude near shorelines via the precomputed terrain map
    vec2 dampUV = (p.xz / 3000.0) + 0.5;
    float dampening = 1.0;
    if (dampUV.x >= 0.0 && dampUV.x <= 1.0 && dampUV.y >= 0.0 && dampUV.y <= 1.0) {
        dampening = texture2D(tDampening, dampUV).r;
    }
    
    // Ice computation (Season 0.75 is peak winter)
    float isWinter = clamp(1.0 - abs(uSeason - 0.75) * 4.0, 0.0, 1.0); // 1.0 at peak winter
    float iceNoise = sin(worldPosData.x * 0.01) * cos(worldPosData.z * 0.01) + sin(worldPosData.x * 0.05 + worldPosData.z * 0.04) * 0.5;
    float iceFactor = clamp((iceNoise * 0.3 + isWinter * 1.5 - 1.0) * 2.0, 0.0, 1.0);
    vIce = iceFactor;
    
    dampening *= (1.0 - iceFactor * 0.95); // Flatten waves on ice
    
    // Final Offset Application
    // Suppress general ocean waves intensely deep inside the smooth funnel
    offset *= (dampening * (1.0 - pow(vFactor, 1.5))); 
    offset.y -= vortexSink * dampening; 
    
    // Normal from tangent/binormal, also dampened
    tangent = mix(vec3(1.0, 0.0, 0.0), tangent, dampening);
    binormal = mix(vec3(0.0, 0.0, 1.0), binormal, dampening);
    vNormal = normalize(cross(binormal, tangent));
    
    // Adjust normal for the elegant smooth vortex sink slope
    if (vFactor > 0.01) {
        // Derivative of 80.0 * pow(smoothstep(160, 0, r), 3)
        // smoothstep(160, 0, r) = f. df/dr approx -1/160 * 3*(f)*(1-f)? Actually it's simple enough to approximate with the linear slope part
        float dSink = 80.0 * 3.0 * pow(vFactor, 2.0) * (1.0 / 160.0) * dampening;
        
        vec2 vDir = normalize(vDelta + 0.001);
        vec3 vortexNormal = normalize(vec3(vDir.x * dSink, 1.0, vDir.y * dSink));
        
        // Blend normal using the sharp slope factor
        vNormal = normalize(mix(vNormal, vortexNormal, vFactor * dampening));
    }
    
    // Jacobian determinant for foam
    float J = (1.0 + dxdx) * (1.0 + dzdz) - (dxdz * dzdx);
    vFoam = clamp(1.0 - J, 0.0, 1.0); // Higher when J is smaller (peaks)
    
    // Apply offset directly to world point
    vec3 finalWorldPos = p + offset;
    vWorldPosition = finalWorldPos;

    // Send correctly displaced world position to screen
    vec4 mvPosition = viewMatrix * vec4(finalWorldPos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    
    #include <fog_vertex>
}
`;

const fragmentShader = `
#define WAKE_NODES ${MAX_WAKE_NODES}

uniform vec3 uBaseColor;
uniform vec3 uShallowColor;
uniform float uTime;
uniform sampler2D tNormal;

uniform float uLightningFlash;
uniform float uSeason;
uniform vec3 uWhirlpoolPos;

// Kelvin Wake
uniform vec3 uBoatPos;
uniform vec3 uBoatDir;
uniform float uBoatSpeed;
uniform float uAbsoluteOdometer;
uniform vec4 uWakeNodes[WAKE_NODES];
uniform vec4 uWakeDirs[WAKE_NODES];

varying vec3 vWorldPosition;
varying float vFoam;
varying vec3 vNormal;
varying float vIce;

#include <fog_pars_fragment>

// Simplex Noise for procedural foam details
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
           -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy) );
  vec2 x0 = v -   i + dot(i, C.xx);
  vec2 i1;
  i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
  + i.x + vec3(0.0, i1.x, 1.0 ));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m*m ;
  m = m*m ;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    vec3 lightDir = normalize(vec3(0.8, 0.6, -0.4)); // Sun direction (golden hour angle)

    // Calculate micro-normals from scrolling texture map
    vec2 baseXZ = vWorldPosition.xz;
    
    // --- Whirlpool Macro-Rotation ---
    // Spin the entirety of the ocean surface mapping within the vortex radius
    vec2 wDelta = baseXZ - uWhirlpoolPos.xz;
    float wDist = length(wDelta);
    float wFactor = smoothstep(160.0, 0.0, wDist);
    if (wFactor > 0.01) {
        // Rotates the texture faster closer to the hole
        float wTwist = (120.0 / (wDist + 10.0)) * wFactor * wFactor + uTime * mix(0.5, 4.0, wFactor);
        float wSn = sin(wTwist);
        float wCs = cos(wTwist);
        baseXZ = uWhirlpoolPos.xz + vec2(wDelta.x * wCs - wDelta.y * wSn, wDelta.x * wSn + wDelta.y * wCs);
    }

    vec2 uv = baseXZ * 0.05;
    vec2 uv0 = uv + vec2(uTime * 0.02, uTime * 0.03);
    vec2 uv1 = uv * 2.0 - vec2(uTime * 0.04, uTime * 0.05);

    vec3 n0 = texture2D(tNormal, uv0).rgb * 2.0 - 1.0;
    vec3 n1 = texture2D(tNormal, uv1).rgb * 2.0 - 1.0;
    vec3 microNormal = normalize(n0 + n1);
    
    // Distance fading to prevent aliasing (noisy white grain at horizon)
    float distToCamera = length(cameraPosition - vWorldPosition);
    float normalFade = clamp(1.0 - (distToCamera / 300.0), 0.0, 1.0);

    // Ice Surface Optics (Voronoi/Simplex crystals)
    float iceCrystalNoise = snoise(vWorldPosition.xz * 4.0) * 0.5 + 0.5;
    vec3 iceMicroNormal = vec3(snoise(vWorldPosition.xz * 2.5), 1.0, snoise(vWorldPosition.xz * 2.5 + 10.0));
    iceMicroNormal = normalize(iceMicroNormal);

    // The water texture shouldn't scroll or look like fluid on solid ice.
    vec3 localMicroNormal = mix(microNormal, iceMicroNormal, vIce);

    // Blend macro normal (Gerstner + Wake) with micro normal
    // On ice, we flatten the macro normal slightly more towards straight up and apply the ice noise
    vec3 baseNormal = mix(vNormal, vec3(0.0, 1.0, 0.0), vIce * 0.5);
    vec3 blendedNormal = normalize(baseNormal + localMicroNormal * 0.3 * normalFade);
    
    // Fresnel Reflection
    float fresnel = clamp(1.0 - dot(viewDir, blendedNormal), 0.0, 1.0);
    
    // Smooth water is reflective. Ice is rough and abrasive.
    float iceRoughnessFresnel = fresnel * 0.8 + (iceCrystalNoise * 0.3);
    fresnel = mix(pow(fresnel, 5.0) * 0.5, iceRoughnessFresnel, vIce); 
    
    // Water Color
    vec3 waterColor = mix(uBaseColor, uShallowColor, fresnel + 0.2);
    
    // Blend with Ice (Slush & Crystals)
    vec3 iceColor = vec3(0.85, 0.9, 0.95); // Frosty white/blue
    vec3 detailedIceColor = mix(iceColor, vec3(1.0, 1.0, 1.0), smoothstep(0.6, 0.9, iceCrystalNoise) * 0.6);
    
    // Use an opacity factor so you can *almost* see through the thin ice
    waterColor = mix(waterColor, detailedIceColor + (fresnel * 0.5), vIce * 0.92);
    
    // Subsurface scattering (light travelling through thin wave peaks)
    float sss = max(0.0, dot(viewDir, -lightDir)) * 0.5 + 0.5;
    
    // Amplify SSS dramatically during a lightning flash
    float effectiveSSS = sss + (uLightningFlash * 2.0);
    
    waterColor += uShallowColor * pow(vFoam, 1.5) * effectiveSSS * 1.2;

    // Foam Logic: Combine physics Jacobian with high-frequency noise
    float noise = snoise(vWorldPosition.xz * 0.3 + uTime * 0.5) * 0.5 + 0.5;
    
    // Tame the foam intensity so it doesn't look like solid white paint
    // Multiplied by normalFade to ensure foam completely disappears in the distance to prevent white noise/grain
    float waveFoamIntensity = smoothstep(0.4, 0.8, vFoam) * smoothstep(0.3, 0.8, noise) * 0.8 * normalFade;
    
    // --- High-Resolution Pixel-Perfect Kelvin Wake (Continuous Segment Evaluation) ---
    float wakeIntensity = 0.0;
    vec2 pXZ = vWorldPosition.xz;
    vec2 boatPos = uBoatPos.xz;
    vec2 boatDir = uBoatDir.xz;
    vec2 delta0 = pXZ - boatPos;
    float distToBoatSq = dot(delta0, delta0);

    // Early exit if >300 meters away from the boat!
    if (distToBoatSq < (300.0 * 300.0) && uBoatSpeed > 2.0) {
        float minSegDistSq = 999999.0;
        float segmentPathDist = 0.0;
        float segmentSpeed = uBoatSpeed;
        
        vec2 prevPos = boatPos;
        float prevPathDist = 0.0; // boat is at dist 0
        float prevSpeed = uBoatSpeed;
        
        for (int i = 0; i < WAKE_NODES; i++) {
            float speed = uWakeDirs[i].z;
            if (speed > 2.0) {
                vec2 nodePos = uWakeNodes[i].xz;
                float nodePathDist = max(0.0, uAbsoluteOdometer - uWakeNodes[i].w);
                
                vec2 AB = nodePos - prevPos;
                float abLenSq = dot(AB, AB);
                if (abLenSq > 0.001) {
                    vec2 AP = pXZ - prevPos;
                    float t = clamp(dot(AP, AB) / abLenSq, 0.0, 1.0);
                    vec2 closestPoint = prevPos + t * AB;
                    
                    vec2 delta = pXZ - closestPoint;
                    float dSq = dot(delta, delta);
                    
                    if (dSq < minSegDistSq) {
                        minSegDistSq = dSq;
                        segmentPathDist = mix(prevPathDist, nodePathDist, t);
                        segmentSpeed = mix(prevSpeed, speed, t);
                    }
                }
                
                prevPos = nodePos;
                prevPathDist = nodePathDist;
                prevSpeed = speed;
            }
        }

        if (minSegDistSq < (150.0 * 150.0) && minSegDistSq != 999999.0) {
            float minDist = sqrt(minSegDistSq);
            float wakeWidth = segmentPathDist * 0.35; // tan(19.5 deg)
            float armDistance = abs(minDist - wakeWidth);
            float armMask = smoothstep(1.5 + segmentPathDist * 0.05, 0.0, armDistance);
            float centerWash = smoothstep(wakeWidth * 0.8, 0.0, minDist) * 0.4;
            
            // Soften Zebra wake mapping by using noise displacement combined with a pulsing structure
            float pulse = sin(segmentPathDist * 0.4 - uTime * 2.0) * 0.5 + 0.5;
            float flowNoise = snoise(pXZ * 0.15 - uTime * vec2(boatDir.x, boatDir.y) * 2.0) * 0.5 + 0.5;
            float fineNoise = snoise(pXZ * 0.6) * 0.5 + 0.5;
            float ripple = (flowNoise * fineNoise) * (1.0 + pulse);
            
            wakeIntensity = (armMask * pow(ripple, 1.5) * 1.5 + centerWash * ripple) * exp(-segmentPathDist / 60.0) * clamp(segmentSpeed/10.0, 0.0, 1.0);
            
            vec2 dirToP = pXZ - boatPos;
            float distToBoat = length(dirToP);
            if (distToBoat > 0.1) {
                dirToP /= distToBoat;
                float dotFront = dot(dirToP, boatDir); 
                wakeIntensity *= smoothstep(0.2, -0.1, dotFront);
            } else {
                wakeIntensity = 0.0;
            }
        }
    }
    
    // Add Kelvin Wake Boat Foam (softer mapping)
    float boatFoamIntensity = smoothstep(0.2, 0.9, max(0.0, wakeIntensity)) * (0.6 + 0.4 * smoothstep(0.1, 0.9, noise));
    float foamIntensity = clamp(waveFoamIntensity + boatFoamIntensity, 0.0, 1.0);
    
    // --- Whirlpool Visual Integration ---
    vec2 vDelta = vWorldPosition.xz - uWhirlpoolPos.xz;
    float vDist = length(vDelta);
    float vFactor = smoothstep(160.0, 0.0, vDist);
    
    if (vFactor > 0.01) {
        // High-detail Swirling Vortex using Twisted Domain FBM
        // 1. Twist the coordinates based on distance to center (faster rotation at center)
        float twist = (120.0 / (vDist + 8.0)) + (vDist * 0.02) + uTime * 3.0; 
        float sn = sin(twist);
        float cs = cos(twist);
        vec2 twistedUV = vec2(vDelta.x * cs - vDelta.y * sn, vDelta.x * sn + vDelta.y * cs);

        // 2. Multiple octaves of noise mapped onto the swirling coordinates
        // This generates the intricate "churning" fluid detail without hard-coded arms
        float n1 = snoise(twistedUV * 0.04 - uTime * 0.2);
        float n2 = snoise(twistedUV * 0.12 + uTime * 0.5);
        float n3 = snoise(twistedUV * 0.35 - uTime);
        float n4 = snoise(twistedUV * 0.8 + uTime * 2.0);
        
        float fbm = n1 * 0.5 + n2 * 0.25 + n3 * 0.125 + n4 * 0.0625; 
        
        // 3. Generate spiraling streaks by using the twisted angle and distance
        float streakAngle = atan(twistedUV.y, twistedUV.x);
        float streakFreq = 24.0; // Lots of thin water streaks
        float spiralStreak = sin(streakAngle * streakFreq + vDist * 0.4 + fbm * 8.0); 
        
        // 4. Combine fluid noise and streaks to mask the foam
        float vFoamLines = smoothstep(0.4, 1.0, spiralStreak * 0.5 + fbm * 1.5 + 0.2);
        
        // Fade foam out smoothly at the edge, intensify near the mid-vortex
        vFoamLines *= smoothstep(160.0, 20.0, vDist);
        
        // Eye Ring: A dense accumulation of torn foam near the sheer drop
        float eyeRingMask = smoothstep(35.0, 10.0, vDist) * smoothstep(5.0, 15.0, vDist);
        vFoamLines = max(vFoamLines, eyeRingMask * smoothstep(-0.2, 0.6, n2 + n3 * 0.5 + 0.2));
        
        // 5. Deep oceanic colors for the vortex
        vec3 deepVortex = vec3(0.000, 0.015, 0.025); // Almost black at the very bottom
        vec3 midVortex = vec3(0.02, 0.12, 0.15); // Deep powerful teal
        vec3 vortexFoamCol = vec3(0.85, 0.95, 1.0); // Churning white-blue foam
        
        // Gradient from rim to deep center
        vec3 vCol = mix(deepVortex, midVortex, smoothstep(8.0, 90.0, vDist));
        
        // Apply foam overriding the base colors
        vCol = mix(vCol, vortexFoamCol, clamp(vFoamLines, 0.0, 1.0));
        
        // The Abyss: Absolute pitch black hole at the absolute center
        vCol *= smoothstep(6.0, 18.0, vDist); 
        
        // Blend whirlpool color with the standard water
        waterColor = mix(waterColor, vCol, pow(vFactor, 1.2));
        
        // Accumulate foam on the global foam layer for rendering later
        foamIntensity = mix(foamIntensity, clamp(vFoamLines, 0.0, 1.0), vFactor);
    }

    vec3 foamColor = vec3(0.85, 0.9, 0.95);
    // Lightning illuminates the dense foam strongly
    foamColor = mix(foamColor, vec3(1.0, 1.0, 1.0), uLightningFlash);

    vec3 finalColor = mix(waterColor, foamColor, foamIntensity);
    
    // Seasonal Ocean Atmosphere
    float summerAmount = clamp(1.0 - abs(uSeason - 0.25) * 4.0, 0.0, 1.0);
    
    // Specular Highlight (The Sun glinting on water)
    vec3 halfVector = normalize(lightDir + viewDir);
    
    // In summer, high heat causes blinding, intense glare on the ocean surface
    float specularPower = mix(300.0, 80.0, summerAmount); // Glare is much wider in extreme high heat
    float specularIntensity = mix(2.0, 6.0, summerAmount); // Glare is blindingly bright
    float specular = pow(max(dot(blendedNormal, halfVector), 0.0), specularPower) * specularIntensity * normalFade;
    
    // Add specular reflection for Lightning
    vec3 lightningDir = normalize(vec3(0.0, 1.0, 0.0)); // Lightning from above
    vec3 halfVectorLightning = normalize(lightningDir + viewDir);
    float specularLightning = pow(max(dot(blendedNormal, halfVectorLightning), 0.0), 150.0) * 3.0 * uLightningFlash * normalFade;

    vec3 sunReflectColor = mix(vec3(1.0, 0.9, 0.8), vec3(1.0, 1.0, 1.0), summerAmount); // Hotter, whiter light in high heat
    finalColor += specular * (1.0 - foamIntensity * 0.5) * sunReflectColor; 
    finalColor += specularLightning * (1.0 - foamIntensity) * vec3(0.8, 0.9, 1.0); // Cold lightning reflection
    
    // Blend to slightly deeper color at horizon so fog takes over naturally
    finalColor = mix(finalColor, uBaseColor, clamp((distToCamera-150.0)/150.0, 0.0, 0.8));

    gl_FragColor = vec4(finalColor, 1.0);
    
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
}
`;

export const getWaveData = () => {
    // We sample the windSpeed inside the physics tick
    const windSpeed = useSimStore.getState().windSpeed;
    
    // Normal storm factor
    let stormFactor = Math.max(0.1, windSpeed / 8.0);
    
    // Phase 3 Rogue Waves: If hurricane wind speeds are present
    let rogueBump = 0;
    if (windSpeed > 35) {
       rogueBump = (windSpeed - 35) * 0.2; // Max out around 3.0 at 50kts, not 7.5
       stormFactor += rogueBump; 
    }
    
    // Critical Fix: Hard-clamp steepness so waves don't intersect their own geometry.
    // The sum of all steepness coefficients below is ~0.35.
    // If wa approaches 1.0, J collapses, and vFoam approaches 1.0 globally.
    // Max steepness must be kept below 2.0 to prevent a completely white chaotic ocean.
    const maxSteepness = Math.min(stormFactor, 1.8);
    
    // Scale wavelength so waves become massive swelling hills rather than sharp spikes.
    // Capping waveScale around 8-12 creates terrifyingly heavy 300m swells.
    const waveScale = 1.0 + stormFactor * 1.2 + rogueBump * 1.5;

    return [
      { x: 1.0, y: 0.5, z: 0.12 * maxSteepness, w: 30.0 * waveScale },  // Primary swell
      { x: 0.7, y: 0.7, z: 0.10 * maxSteepness, w: 15.0 * waveScale * 0.8 },  // Secondary
      { x: -0.2, y: 1.0, z: 0.08 * maxSteepness, w: 7.0 + stormFactor * 2.0 + rogueBump * 1.0 },  // Chop
      { x: 0.5, y: -0.5, z: 0.05 * maxSteepness, w: 3.0 + stormFactor + rogueBump }   // High frequency chop
    ];
};

// Helper for the boat to bob exactly with the Gerstner waves
export const getWaveHeight = (x: number, z: number, time: number) => {
    const currentWaves = getWaveData();

    // Gerstner waves physically displace points horizontally as well as vertically.
    // To know the exact wave height at world coordinate (x,z), we have to work backwards
    // using a fixed-point iteration to find which resting coordinate (pX, pZ) ended up at (x,z).
    let pX = x;
    let pZ = z;

    for (let iter = 0; iter < 4; iter++) {
        let offsetX = 0;
        let offsetZ = 0;

        for (let wave of currentWaves) {
            let dir = new Vector2(wave.x, wave.y).normalize();
            let steepness = wave.z;
            let wavelength = wave.w;
            let k = 2.0 * Math.PI / wavelength;
            let c = Math.sqrt(9.8 / k);
            let f = k * (dir.x * pX + dir.y * pZ - c * time);
            let a = steepness / k;

            offsetX += dir.x * (a * Math.cos(f)) * 0.4;
            offsetZ += dir.y * (a * Math.cos(f)) * 0.4;
        }

        pX = x - offsetX;
        pZ = z - offsetZ;
    }

    // Now calculate the final Y height using the converged grid position
    let finalY = 0;
    for (let wave of currentWaves) {
        let dir = new Vector2(wave.x, wave.y).normalize();
        let steepness = wave.z;
        let wavelength = wave.w;
        let k = 2.0 * Math.PI / wavelength;
        let c = Math.sqrt(9.8 / k);
        let f = k * (dir.x * pX + dir.y * pZ - c * time);
        let a = steepness / k;

        finalY += a * Math.sin(f);
    }
    
    // Dampen waves near shore (beaches don't have massive swell right at the sand)
    const terrainHeight = getTerrainHeight(x, z);
    let dampening = 1.0;
    if (terrainHeight > -10.0) {
        // Linearly dampen wave height from 10m depth to 0m depth
        dampening = Math.max(0, Math.min(1.0, -terrainHeight / 10.0));
    }
    
    // Ice dampening
    const isWinter = Math.max(0, Math.min(1.0, 1.0 - Math.abs(sharedPhysics.season - 0.75) * 4.0));
    const iceNoise = Math.sin(x * 0.01) * Math.cos(z * 0.01) + Math.sin(x * 0.05 + z * 0.04) * 0.5;
    const iceFactor = Math.max(0, Math.min(1.0, (iceNoise * 0.3 + isWinter * 1.5 - 1.0) * 2.0));
    dampening *= (1.0 - iceFactor * 0.95);
    
    // The ocean mesh is positioned at y=-1 in the scene
    let y = finalY * dampening - 1.0;

    // Apply Whirlpool Sink to Physics
    const whirlpoolPos = sharedPhysics.whirlpoolPos;
    const dx = x - whirlpoolPos.x;
    const dz = z - whirlpoolPos.z;
    const vDist = Math.sqrt(dx*dx + dz*dz);
    
    // Matched to shader: smoothstep(160.0, 0.0, vDist)
    let vFactor = 0;
    if (vDist < 160.0) {
       vFactor = 1.0 - MathUtils.smoothstep(vDist, 0.0, 160.0);
    }
    
    // Suppress general waves intensely deep inside the vortex
    y *= (1.0 - Math.pow(vFactor, 1.5));
    
    // Matched to shader: pow(vFactor, 3.0) * 80.0
    const vortexSink = Math.pow(vFactor, 3.0) * 80.0 * dampening;
    
    return { x, y: y - vortexSink, z };
};

export default function Ocean() {
  const meshRef = useRef<Mesh>(null);

  // Load a highly realistic water normal map (used in three.js examples)
  const baseWaterNormals = useLoader(TextureLoader, 'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/waternormals.jpg');
  const waterNormals = useMemo(() => {
    const tex = baseWaterNormals.clone();
    tex.wrapS = tex.wrapT = RepeatWrapping;
    return tex;
  }, [baseWaterNormals]);

  // Precompute shoreline dampening into a texture for the vertex shader
  const dampeningMap = useMemo(() => {
    const size = 256; // 256x256 is enough resolution when bilinear filtered
    const data = new Uint8Array(size * size * 4);
    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size; j++) {
        // map 0..size to -1500..1500 world coords (matches the 3000x3000 Island mesh)
        const x = (i / (size - 1) - 0.5) * 3000;
        const z = (j / (size - 1) - 0.5) * 3000;
        const h = getTerrainHeight(x, z);
        
        let d = 1.0;
        if (h > -10.0) {
            d = Math.max(0, Math.min(1.0, -h / 10.0));
        }
        
        const idx = (j * size + i) * 4;
        data[idx] = Math.floor(d * 255); // R channel holds our dampening multiplier
        data[idx+1] = 0;
        data[idx+2] = 0;
        data[idx+3] = 255;
      }
    }
    const tex = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
    tex.magFilter = LinearFilter;
    tex.minFilter = LinearFilter;
    tex.needsUpdate = true;
    return tex;
  }, []);

  const uniforms = useMemo(() => {
    const waves = getWaveData();
    return UniformsUtils.merge([
      UniformsLib['fog'],
      {
        uTime: { value: 0 },
        uSeason: { value: 0 },
        uWaves: { value: waves.map(w => new Vector4(w.x, w.y, w.z, w.w)) },
        tNormal: { value: waterNormals },
        tDampening: { value: dampeningMap },
        uBaseColor: { value: new Color('#021a28') }, // Deep dark oceanic blue
        uShallowColor: { value: new Color('#0d6b7a') }, // Rich teal for subsurface scattering
        uWhirlpoolPos: { value: new Vector3() },
        uBoatPos: { value: new Vector3() },
        uBoatDir: { value: new Vector3() },
        uBoatSpeed: { value: 0 },
        uLightningFlash: { value: 0 },
        uAbsoluteOdometer: { value: 0 },
        uWakeNodes: { value: Array(MAX_WAKE_NODES).fill(null).map(() => new Vector4()) },
        uWakeDirs: { value: Array(MAX_WAKE_NODES).fill(null).map(() => new Vector4()) },
      }
    ]);
  }, [waterNormals]);

  useFrame((state) => {
    if (meshRef.current) {
        const mat = meshRef.current.material as ShaderMaterial;
        mat.uniforms.uTime.value = state.clock.elapsedTime;
        
        // Pass shared physics data to the shader
        mat.uniforms.uWhirlpoolPos.value.copy(sharedPhysics.whirlpoolPos);
        mat.uniforms.uBoatPos.value.copy(sharedPhysics.boatPos);
        mat.uniforms.uBoatDir.value.copy(sharedPhysics.boatDir);
        mat.uniforms.uBoatSpeed.value = sharedPhysics.boatSpeed;
        mat.uniforms.uLightningFlash.value = sharedPhysics.lightningFlash;
        mat.uniforms.uAbsoluteOdometer.value = sharedPhysics.absoluteOdometer;

        for (let i = 0; i < MAX_WAKE_NODES; i++) {
            mat.uniforms.uWakeNodes.value[i].set(
                sharedPhysics.wakeNodes[i*4],
                sharedPhysics.wakeNodes[i*4+1],
                sharedPhysics.wakeNodes[i*4+2],
                sharedPhysics.wakeNodes[i*4+3]
            );
            mat.uniforms.uWakeDirs.value[i].set(
                sharedPhysics.wakeDirs[i*4],
                sharedPhysics.wakeDirs[i*4+1],
                sharedPhysics.wakeDirs[i*4+2],
                sharedPhysics.wakeDirs[i*4+3]
            );
        }
        
        // Dynamically update wave uniforms for storm scaling
        const dynamicWaves = getWaveData();
        mat.uniforms.uWaves.value = dynamicWaves.map(w => new Vector4(w.x, w.y, w.z, w.w));
        
        // Dynamic Atmospheric Darkening (Lerping colors based on wind speed)
        const windSpeed = useSimStore.getState().windSpeed;
        const stormIntensity = MathUtils.clamp((windSpeed - 15) / 35.0, 0.0, 1.0); // Starts at 15m/s wind
        
        const calmBase = new Color('#021a28');
        const stormBase = new Color('#010508');
        mat.uniforms.uBaseColor.value.copy(calmBase).lerp(stormBase, stormIntensity);
        
        const calmShallow = new Color('#0d6b7a');
        const stormShallow = new Color('#05252b');
        mat.uniforms.uShallowColor.value.copy(calmShallow).lerp(stormShallow, stormIntensity);
        
        mat.uniforms.uSeason.value = sharedPhysics.season;

        // Snap the underlying geometry grid to the camera to create infinite ocean
        // Because the shader calculates displacement based on WORLD position,
        // moving the local position like this will just slide the vertices UNDER the mathematical wave.
        const cx = Math.round(state.camera.position.x / 10) * 10;
        const cz = Math.round(state.camera.position.z / 10) * 10;
        
        meshRef.current.position.x = cx;
        meshRef.current.position.z = cz;
    }
  });

  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -1, 0]}>
      {/* 2000x2000 size with 1000 segments ensures vertices are EXACTLY 2.0 units apart. 
          This aligns perfectly with our camera snapping of 10.0 units, preventing wave pulsation / warping artifacts */}
      <planeGeometry args={[2000, 2000, 1000, 1000]} />
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        wireframe={false}
        fog={true}
      />
    </mesh>
  );
}
