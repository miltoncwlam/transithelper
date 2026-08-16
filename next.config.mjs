/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingIncludes: {
    '*': [
      './node_modules/@swc/helpers/**/*',
      './node_modules/client-only/**/*'
    ]
  }
};

export default nextConfig;
