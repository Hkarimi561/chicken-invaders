import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: false, // the game loop and audio start in effects; double-mounting them in dev only causes noise
  poweredByHeader: false,
  async headers() {
    return [
      { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache' }, { key: 'Service-Worker-Allowed', value: '/' }] },
    ];
  },
};
export default config;
