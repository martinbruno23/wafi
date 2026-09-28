import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // sharp (imágenes del pass de Apple) carga su librería nativa libvips con
  // dlopen, y el análisis de archivos de Next no la detecta: en Vercel la
  // función quedaba sin `libvips-cpp.so` y sharp no cargaba (2026-09-28).
  // Se incluye a mano en las rutas que generan passes.
  outputFileTracingIncludes: {
    "/api/**/*": [
      "./node_modules/@img/sharp-linux-x64/**/*",
      "./node_modules/@img/sharp-libvips-linux-x64/**/*",
    ],
  },
};

export default nextConfig;
