import js from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const sourceFiles = ['**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}'];
const typescriptFiles = ['**/*.{ts,tsx,mts,cts}'];
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
  js.configs.recommended,
  ...tseslint.configs.recommended,
  nextPlugin.configs['core-web-vitals'],
  {
    files: sourceFiles,
    plugins: {
      'react-hooks': reactHooks,
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        ecmaFeatures: {
jsx: true,
        },
      },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },
  {
    files: typescriptFiles,
    rules: {
      'no-undef': 'off',
      'no-unused-vars': 'off',
    },
  },
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
