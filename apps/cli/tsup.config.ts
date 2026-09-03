import { libConfig } from "@norma/tsup-config";

export default libConfig({
  entry: ["src/index.ts"],
  banner: { js: "#!/usr/bin/env node" },
  dts: false,
  // Bundle all workspace packages into the CLI so the built binary is self-contained
  // (their `exports` resolve to TS source for dev tooling; Node can't run that at runtime).
  noExternal: [/^@norma\//],
});
