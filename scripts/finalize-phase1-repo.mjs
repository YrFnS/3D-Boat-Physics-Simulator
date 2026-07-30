import fs from 'node:fs';

function replaceOnce(source, pattern, replacement, label) {
  const matches = source.match(pattern);
  if (!matches || matches.length !== 1) {
    throw new Error(`${label}: expected exactly one match`);
  }
  return source.replace(pattern, replacement);
}

const benchmarkPath = 'components/BenchmarkPanel.tsx';
let benchmark = fs.readFileSync(benchmarkPath, 'utf8');

if (!benchmark.includes('function loadLastResult()')) {
  benchmark = replaceOnce(
    benchmark,
    /\nexport default function BenchmarkPanel\(\) \{/,
    `\nfunction loadLastResult(): BenchmarkResult | null {\n  if (typeof window === 'undefined') return null;\n\n  try {\n    const stored = window.localStorage.getItem(STORAGE_KEY);\n    if (!stored) return null;\n    const results = JSON.parse(stored) as BenchmarkResult[];\n    return results[0] ?? null;\n  } catch {\n    return null;\n  }\n}\n\nexport default function BenchmarkPanel() {`,
    'insert benchmark result loader',
  );
}

benchmark = replaceOnce(
  benchmark,
  /const \[lastResult, setLastResult\] = useState<BenchmarkResult \| null>\(null\);/,
  'const [lastResult, setLastResult] = useState<BenchmarkResult | null>(loadLastResult);',
  'initialize benchmark result lazily',
);

benchmark = replaceOnce(
  benchmark,
  /  useEffect\(\(\) => \{\n    mountedRef\.current = true;\n    try \{[\s\S]*?\n    return \(\) => \{\n      mountedRef\.current = false;\n      cancelledRef\.current = true;\n    \};\n  \}, \[\]\);/,
  `  useEffect(() => {\n    mountedRef.current = true;\n\n    return () => {\n      mountedRef.current = false;\n      cancelledRef.current = true;\n    };\n  }, []);`,
  'remove synchronous benchmark effect state update',
);

fs.writeFileSync(benchmarkPath, benchmark);

const packageJson = {
  name: '3d-boat-physics-simulator',
  version: '0.1.0',
  private: true,
  scripts: {
    dev: 'next dev',
    build: 'next build',
    start: 'next start',
    lint: 'eslint . --max-warnings=0',
    'lint:fix': 'eslint . --fix',
    typecheck: 'tsc --noEmit',
    clean:
      'node -e "require(\'node:fs\').rmSync(\'.next\',{recursive:true,force:true})"',
  },
  dependencies: {
    '@react-three/drei': '^10.7.7',
    '@react-three/fiber': '^9.6.0',
    'lucide-react': '^0.553.0',
    next: '16.2.12',
    react: '19.2.8',
    'react-dom': '19.2.8',
    'simplex-noise': '^4.0.3',
    three: '^0.184.0',
    zustand: '^5.0.12',
  },
  devDependencies: {
    '@tailwindcss/postcss': '4.1.11',
    '@types/node': '^22',
    '@types/react': '^19',
    '@types/react-dom': '^19',
    '@types/three': '^0.184.0',
    autoprefixer: '^10.4.21',
    eslint: '^9.39.1',
    'eslint-config-next': '16.2.12',
    postcss: '8.5.22',
    tailwindcss: '4.1.11',
    typescript: '5.9.3',
  },
};

fs.writeFileSync('package.json', `${JSON.stringify(packageJson, null, 2)}\n`);

fs.writeFileSync(
  'next.config.ts',
  `import type { NextConfig } from 'next';\n\nconst nextConfig: NextConfig = {\n  output: 'standalone',\n  reactStrictMode: true,\n};\n\nexport default nextConfig;\n`,
);

fs.writeFileSync(
  'eslint.config.mjs',
  `import { defineConfig, globalIgnores } from 'eslint/config';\nimport nextVitals from 'eslint-config-next/core-web-vitals';\nimport nextTypeScript from 'eslint-config-next/typescript';\n\nconst imperativeThreeFiles = [\n  'components/EnvironmentRig.tsx',\n  'components/Islands.tsx',\n  'components/Ocean.tsx',\n  'components/PerformanceTelemetry.tsx',\n  'components/WakeField.tsx',\n  'components/WeatherEffects.tsx',\n  'components/boat/useBoatVisualDamage.ts',\n];\n\nexport default defineConfig([\n  ...nextVitals,\n  ...nextTypeScript,\n  {\n    files: imperativeThreeFiles,\n    rules: {\n      // React Three Fiber deliberately mutates Three.js objects in useFrame.\n      // These compiler-oriented rules treat that imperative rendering pattern\n      // as React state mutation even though the objects live outside React.\n      'react-hooks/immutability': 'off',\n      'react-hooks/refs': 'off',\n    },\n  },\n  globalIgnores([\n    '.next/**',\n    'out/**',\n    'build/**',\n    'artifacts/**',\n    'next-env.d.ts',\n  ]),\n]);\n`,
);

fs.writeFileSync(
  'README.md',
  `# 3D Boat Physics Simulator\n\nAn interactive browser-based marine simulation built with Next.js, React Three Fiber, and Three.js. The project combines procedural water, weather, vessel handling, damage, and a responsive instrument HUD in a single local-first web application.\n\n> **Project status:** this is a performance-optimized simulation prototype. The current vessel model uses custom approximations for buoyancy, drag, steering, and collisions. A fixed-timestep rigid-body and distributed-buoyancy system is planned for the next physics phase.\n\n## Features\n\n- Procedural Gerstner-wave ocean with matching CPU water sampling.\n- GPU-generated wake field, rain, hurricane clouds, lightning, and storm effects.\n- Trawler and speedboat handling with wind, current, planing, damage, repair, and beaching behavior.\n- Procedural islands, seasonal terrain appearance, buoys, a whirlpool, and weather-gated tornado hazards.\n- Adaptive Low, Medium, High, and Ultra quality tiers with ocean, terrain, weather, wake, and shadow budgets.\n- Desktop keyboard controls and responsive touch controls for throttle, steering, repair, environment, wind, and current.\n- Optional FPS, draw-call, triangle, and Calm/Storm benchmark diagnostics.\n- Automated production build plus desktop and mobile Playwright smoke tests.\n\n## Tech stack\n\n- Next.js 16 and React 19\n- React Three Fiber, Drei, and Three.js\n- Zustand\n- Tailwind CSS 4\n- TypeScript and ESLint\n\n## Getting started\n\n### Requirements\n\n- Node.js 22 recommended\n- npm 10 or newer\n\n### Install and run\n\n\`\`\`bash\nnpm ci\nnpm run dev\n\`\`\`\n\nOpen \`http://localhost:3000\`.\n\n### Validation\n\n\`\`\`bash\nnpm run lint\nnpm run typecheck\nnpm run build\n\`\`\`\n\n## Controls\n\n- \`W\` / \`S\` or arrow up/down: forward and reverse throttle\n- \`A\` / \`D\` or arrow left/right: steer\n- Hold \`R\` while nearly stopped with throttle cut: repair\n- On touch devices, use the on-screen directional and repair controls\n\n## Rendering quality and diagnostics\n\nThe quality selector is available in production and its selection is remembered. Auto mode chooses a conservative initial tier from the device profile, then adapts using measured rendering performance.\n\nAppend \`?debug=1\` to enable FPS metrics and Calm/Storm benchmark controls. Append \`?debug=0\` to clear the remembered debug preference.\n\n## Project structure\n\n- \`app/\`: App Router entry point and global styles\n- \`components/\`: simulation rendering, vessel behavior, HUD, weather, wake, and diagnostics\n- \`components/boat/\`: vessel audio and visual-damage subsystems\n- \`lib/\`: deterministic terrain and simulation helpers\n- \`store/\`: Zustand controls, telemetry, quality state, and shared high-frequency values\n- \`.github/workflows/\`: build and browser smoke validation\n\n## License\n\nMIT. See [LICENSE](LICENSE).\n`,
);

fs.writeFileSync(
  'LICENSE',
  `MIT License\n\nCopyright (c) 2026 YrFnS\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\nof this software and associated documentation files (the "Software"), to deal\nin the Software without restriction, including without limitation the rights\nto use, copy, modify, merge, publish, distribute, sublicense, and/or sell\ncopies of the Software, and to permit persons to whom the Software is\nfurnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all\ncopies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\nIMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\nFITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\nAUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\nLIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\nOUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE\nSOFTWARE.\n`,
);

for (const obsoletePath of [
  '.env.example',
  '.eslintrc.json',
  '.github/workflows/dependency-audit.yml',
  'components/River.tsx',
  'hooks/use-mobile.ts',
  'lib/utils.ts',
]) {
  fs.rmSync(obsoletePath, { force: true });
}

console.log('Prepared final Phase 1 repository cleanup.');
