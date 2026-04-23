'use client';

import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { ShaderMaterial, DoubleSide, MathUtils, Group } from 'three';
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
uniform float uTime;
varying vec2 vUv;
varying float vElevation;
varying vec3 vWorldNormal;

${simplex3D}

void main() {
    vUv = uv;
    vec3 pos = position;
    float normalizedY = pos.y + 150.0; // Map from [-150, 150] to [0, 300]
    
    // Twist the cylinder violently
    float angle = normalizedY * 0.05 + uTime * -10.0; // Negative for clockwise updraft
    float s = sin(angle);
    float c = cos(angle);
    mat2 rot = mat2(c, -s, s, c);
    pos.xz = rot * pos.xz;

    // Bend / Snake effect via noise so the funnel whips around
    float bendX = snoise(vec3(0.0, normalizedY * 0.01 - uTime * 0.5, uTime * 0.2));
    float bendZ = snoise(vec3(uTime * 0.2, normalizedY * 0.01 - uTime * 0.5, 0.0));
    
    // Multiplied by height so the base stays relatively planted while the top flails
    pos.x += bendX * (normalizedY * 0.15); 
    pos.z += bendZ * (normalizedY * 0.15);

    vElevation = normalizedY;
    
    // Fake the normal for some light catching
    vWorldNormal = normalize(normalMatrix * normal);

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

const fragmentShader = `
uniform float uTime;
uniform float uOpacity;
varying vec2 vUv;
varying float vElevation;
varying vec3 vWorldNormal;

${simplex3D}

void main() {
    // Fast spinning UVs for the tornado texture
    vec2 scrolledUv1 = vec2(vUv.x * 8.0 - uTime * 6.0, vUv.y * 12.0 - uTime * 10.0);
    vec2 scrolledUv2 = vec2(vUv.x * 5.0 - uTime * 8.0, vUv.y * 8.0 - uTime * 14.0);
    
    float noise1 = snoise(vec3(scrolledUv1, uTime * 0.5));
    float noise2 = snoise(vec3(scrolledUv2, uTime * 0.8));
    
    float combinedNoise = (noise1 * 0.6 + noise2 * 0.4) * 0.5 + 0.5;

    // Lighting falloff - edges are softer
    float edgeFade = smoothstep(0.0, 0.4, clamp(1.0 - abs(vUv.x - 0.5) * 2.0, 0.0, 1.0));
    
    // Height fade (blend into ocean and clouds)
    // Start solid near water, fade out entirely high in the clouds
    float heightFade = smoothstep(-5.0, 10.0, vElevation) * (1.0 - smoothstep(180.0, 280.0, vElevation));

    vec3 darkWater = vec3(0.08, 0.12, 0.18);
    vec3 wash = vec3(0.7, 0.8, 0.9);
    vec3 color = mix(darkWater, wash, combinedNoise * 0.8);
    
    // Add specular-like tearing
    float tearing = smoothstep(0.8, 1.0, combinedNoise);
    color += tearing * 0.5;

    // The tornado alpha is driven heavily by the swirling noise to give it volume
    float alphaMask = clamp(combinedNoise * edgeFade * heightFade * 2.0, 0.0, 1.0);
    float finalAlpha = alphaMask * uOpacity;

    gl_FragColor = vec4(color, finalAlpha);
    
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
}
`;

export default function Tornado() {
  const materialRef = useRef<ShaderMaterial>(null);
  const groupRef = useRef<Group>(null);
  const opacityRef = useRef(0);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uOpacity: { value: 0 },
    }),
    []
  );

  useFrame((state, delta) => {
    const windSpeed = useSimStore.getState().windSpeed;
    
    // Lerp actual opacity to 0.9 permanently so it represents a rogue "clear weather" waterspout / maelstrom
    opacityRef.current = MathUtils.lerp(opacityRef.current, 0.9, delta * 0.5);

    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value += delta;
      materialRef.current.uniforms.uOpacity.value = opacityRef.current;
    }

    if (groupRef.current) {
      // Hide completely if not active to save render cycles
      groupRef.current.visible = opacityRef.current > 0.01;
      
      // Giant slow orbit synced via sharedPhysics
      groupRef.current.position.x = sharedPhysics.tornadoPos.x;
      groupRef.current.position.z = sharedPhysics.tornadoPos.z;
    }
  });

  return (
    <group ref={groupRef}>
      <mesh position={[0, -2, 0]}>
        {/* Tapered cylinder: wider at top docs, narrower at bottom, very tall */}
        <cylinderGeometry args={[100, 3, 300, 32, 64, true]} />
        <shaderMaterial
          ref={materialRef}
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          uniforms={uniforms}
          transparent={true}
          side={DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
