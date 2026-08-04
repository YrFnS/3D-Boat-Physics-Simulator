import type { NextConfig } from 'next';

const releaseCandidateSha =
  process.env.VERCEL_GIT_COMMIT_SHA ??
  process.env.GITHUB_SHA ??
  'local-or-unknown';

const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA: releaseCandidateSha,
  },
};

export default nextConfig;
