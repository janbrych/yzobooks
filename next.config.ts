import type { NextConfig } from "next";

const isGithubActions = process.env.GITHUB_ACTIONS === 'true';
const isStaticExport = process.env.STATIC_EXPORT === 'true' || isGithubActions;

const basePath = isStaticExport ? (process.env.BASE_PATH ?? '/yzobooks') : (process.env.BASE_PATH ?? '');

const nextConfig: NextConfig = {
  ...(isStaticExport ? { output: 'export' } : {}),
  basePath,
  // Client code that loads files from public/ itself (the barcode decoder's
  // .wasm) needs the prefix too.
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
