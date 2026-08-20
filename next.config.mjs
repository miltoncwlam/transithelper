import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const localApiBase = path.join(root, 'lib/apiBase.local.js');
const useLocalApiBase = fs.existsSync(localApiBase) && !process.env.VERCEL;

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingIncludes: {
    '*': [
      './node_modules/@swc/helpers/**/*',
      './node_modules/client-only/**/*'
    ]
  },
  ...(useLocalApiBase
    ? {
        turbopack: {
          resolveAlias: {
            '@/lib/apiBase': localApiBase,
            '@/lib/apiBase.js': localApiBase
          }
        }
      }
    : {}),
  webpack: (config) => {
    if (useLocalApiBase) {
      config.resolve.alias['@/lib/apiBase'] = localApiBase;
      config.resolve.alias['@/lib/apiBase.js'] = localApiBase;
    }
    return config;
  }
};

export default nextConfig;
