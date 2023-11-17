import { generatorHandler } from "@prisma/generator-helper";

import { generate } from "./generate";

generatorHandler({
  onManifest() {
    return {
      defaultOutput: "json-schema",
      prettyName: "Prisma Seed Generator",
      requiresGenerators: ["prisma-client-js"]
    };
  },
  onGenerate: generate
});
