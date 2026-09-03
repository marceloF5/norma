import { defineConfig } from "tsup";

/**
 * Shared tsup preset for Harness library packages.
 * @param {import('tsup').Options} [overrides]
 */
export function libConfig(overrides = {}) {
  return defineConfig({
    entry: ["src/index.ts"],
    format: ["esm"],
    target: "node20",
    dts: true,
    clean: true,
    sourcemap: true,
    treeshake: true,
    ...overrides,
  });
}
