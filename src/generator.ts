import { resolve } from "node:path";

import { generatorHandler } from "@prisma/generator-helper";

import { generate } from "./generate";

generatorHandler({
  onManifest: () => ({
    defaultOutput: resolve(process.cwd(), "node_modules/.prisma/seed"),
    prettyName: "Prisma Seed Generator",
    requiresGenerators: ["prisma-client-js"]
  }),
  onGenerate: generate
});
