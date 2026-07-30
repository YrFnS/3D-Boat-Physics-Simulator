import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypeScript from 'eslint-config-next/typescript';

const imperativeThreeFiles = [
  'components/EnvironmentRig.tsx',
  'components/Islands.tsx',
  'components/Ocean.tsx',
  'components/PerformanceTelemetry.tsx',
  'components/WakeField.tsx',
  'components/WeatherEffects.tsx',
  'components/boat/useBoatVisualDamage.ts',
];

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  {
    files: imperativeThreeFiles,
    rules: {
      // React Three Fiber deliberately mutates Three.js objects in useFrame.
      // These compiler-oriented rules treat that imperative rendering pattern
      // as React state mutation even though the objects live outside React.
      'react-hooks/immutability': 'off',
      'react-hooks/refs': 'off',
    },
  },
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'artifacts/**',
    'next-env.d.ts',
  ]),
]);
