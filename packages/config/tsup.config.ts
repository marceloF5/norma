import { libConfig } from "@norma/tsup-config";

export default libConfig({
  entry: ["src/index.ts", "src/presets/software-dev.ts"],
});
