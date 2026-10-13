import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  turbopack: {
    root: process.cwd(),
  },
  // Permite acceder al dev server desde el navegador de Windows vía la IP
  // de la VM WSL2 — sin esto Next.js rechaza los assets/HMR con 403 porque
  // el Host header no coincide con localhost.
  allowedDevOrigins: [
    "172.31.76.38",
    "localhost",
    "*.ngrok-free.app",
    "*.ngrok.app",
    "*.ngrok.io",
  ],
};

export default nextConfig;
