import type { NextConfig } from 'next';

const config: NextConfig = {
  // A self-contained server in .next/standalone, so the image needs no node_modules.
  output: 'standalone',
};

export default config;
