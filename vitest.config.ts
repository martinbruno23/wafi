import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      // Mismo alias que tsconfig/Next.
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // `server-only` lanza al importarse fuera de un contexto de servidor de
      // React; en tests lo reemplazamos por un módulo vacío.
      "server-only": fileURLToPath(
        new URL("./src/test/server-only-stub.ts", import.meta.url),
      ),
    },
  },
});
