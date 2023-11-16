import { GeneratorConfig } from "@prisma/generator-helper";
import { parseEnvValue } from "@prisma/internals";

export const getGeneratorConfigByProvider = (generators: GeneratorConfig[], provider: string) =>
  generators.find(it => parseEnvValue(it.provider) === provider);
