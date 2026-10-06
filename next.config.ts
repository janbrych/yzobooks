import type { NextConfig } from "next";

const isGithubActions = process.env.GITHUB_ACTIONS === 'true';
const isStaticExport = process.env.STATIC_EXPORT === 'true' || isGithubActions;

const nextConfig: NextConfig = {
  ...(isStaticExport ? { output: 'export' } : {}),
  basePath: isStaticExport ? (process.env.BASE_PATH ?? '/yzobooks') : (process.env.BASE_PATH ?? ''),
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
