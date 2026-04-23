'use client';

import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { ShaderMaterial, BackSide, MathUtils, Mesh } from 'three';
import { useSimStore, sharedPhysics } from '@/store/useSimStore';

const simplex3D = `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
  const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);

  vec3 i  = floor(v + dot(v, C.yyy) );
  vec3 x0 = v - i + dot(i, C.xxx) ;

  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min( g.xyz, l.zxy );
  vec3 i2 = max( g.xyz, l.zxy );

  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;

  i = mod289(i);
  vec4 p = permute( permute( permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0 ))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));

  float n_ = 0.142857142857;
  vec3  ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_ );

  vec4 x = x_ *ns.x + ns.yyyy;
  vec4 y = y_ *ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4( x.xy, y.xy );
  vec4 b1 = vec4( x.zw, y.zw );

  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;

  vec3 p0 = vec3(a0.xy,h.x);
  vec3 p1 = vec3(a0.zw,h.y);
  vec3 p2 = vec3(a1.xy,h.z);
  vec3 p3 = vec3(a1.zw,h.w);

  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1),
                                dot(p2,x2), dot(p3,x3) ) );
}
`;

const vertexShader = `
varying vec2 vUv;
varying vec3 vWorldPos;

void main() {
    vUv = uv;
    vec4 wPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = wPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * wPos;
}
`;

const fragmentShader = `
uniform float uTime;
uniform float uOpacity;
uniform float uLightning;
varying vec2 vUv;
varying vec3 vWorldPos;

${simplex3D}

float fbm(vec3 x) {
    float v = 0.0;
    float a = 0.5;
    vec3 shift = vec3(100.0);
    for (int i = 0; i < 4; ++i) {
        v += a * snoise(x);
        x = x * 2.0 + shift;
        a *= 0.5;
    }
    return v;
}

void main() {
    // Top pole (zenith) is vUv.y = 1.0. Equator is vUv.y = 0.0.
    float dist = 1.0 - vUv.y;
    
    // Polar swirl conversion
    float angle = vUv.x * 6.28318530718;
    // Swirl is aggressive towards the center, drags slowly on the outside
    float swirl = angle - uTime * 0.15 - (pow(dist, 0.5) * 6.0); 
    
    vec2 samplePos = vec2(cos(swirl), sin(swirl)) * dist;
    
    // Fractal Brownian Motion for the cloud texture
    float n = fbm(vec3(samplePos * 5.0, uTime * 0.05));
    
    // The 'Eye of the Storm' opening directly overhead
    float eyeMask = smoothstep(0.015, 0.12, dist);
    
    // Smooth blending towards the horizon (vUv.y = 0)
    // Fades into the storm fog instead of clipping violently
    float horizonFade = smoothstep(1.0, 0.5, dist);
    
    float rawDensity = (n * 0.5 + 0.5) * eyeMask * horizonFade;
    // Harder threshold to create specific cloud bands
    float density = smoothstep(0.25, 0.8, rawDensity);

    // Hurricane Cloud Colors (Dark, ominous)
    vec3 darkCloud = vec3(0.05, 0.08, 0.12);
    vec3 midCloud  = vec3(0.12, 0.16, 0.22);
    vec3 lightCloud = vec3(0.25, 0.3, 0.35);

    vec3 col = mix(darkCloud, midCloud, smoothstep(0.0, 0.5, n));
    col = mix(col, lightCloud, smoothstep(0.5, 1.0, n));
    
    // Inject volumetric lightning flashes into the clouds
    // We sample noise again rapidly to make the lightning localized inside specific cloud pockets
    float flashMask = max(0.0, snoise(vec3(samplePos * 4.0, uTime * 4.0)));
    col += vec3(0.8, 0.9, 1.0) * flashMask * uLightning * density * 2.0;

    float finalAlpha = clamp(density * uOpacity, 0.0, 1.0);

    gl_FragColor = vec4(col, finalAlpha);
    
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`;

export default function HurricaneClouds() {
  const materialRef = useRef<ShaderMaterial>(null);
  const meshRef = useRef<Mesh>(null);
  const opacityRef = useRef(0);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uLightning: { value: 0 }
    }),
    []
  );

  useFrame((state, delta) => {
    const windSpeed = useSimStore.getState().windSpeed;
    
    // Hurricane ceiling emerges at 30 knots, reaches peak terrifying darkness at 45 knots
    const targetOpacity = MathUtils.clamp((windSpeed - 30) / 15.0, 0, 1) * 0.98;
    
    opacityRef.current = MathUtils.lerp(opacityRef.current, targetOpacity, delta * 0.5);

    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value += delta;
      materialRef.current.uniforms.uOpacity.value = opacityRef.current;
      materialRef.current.uniforms.uLightning.value = sharedPhysics.lightningFlash;
    }

    if (meshRef.current) {
      meshRef.current.visible = opacityRef.current > 0.01;
      
      // Keep the giant storm dome locked explicitly over the camera
      // so it spans to the horizon endlessly
      meshRef.current.position.set(state.camera.position.x, 0, state.camera.position.z);
    }
  });

  return (
    <mesh ref={meshRef}>
      {/* 
        A massive hemisphere (radius 800) covering the upper sky. 
        Math.PI / 2 limits it to the top half of the sphere. 
      */}
      <sphereGeometry args={[800, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent={true}
        side={BackSide}
        depthWrite={false}
      />
    </mesh>
  );
}
