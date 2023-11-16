import { dirname, resolve } from "node:path";

import { GeneratorOptions } from "@prisma/generator-helper";
import { getDMMF } from "@prisma/internals";

import { Config, Transformer } from "./core/transformer";
import { getGeneratorConfigByProvider } from "./utils/get-generator-config-by-provider";

interface GeneratorConfig extends Omit<Config, "output"> {}

export const generate = async (options: GeneratorOptions) => {
  const prismaClientGeneratorConfig = getGeneratorConfigByProvider(
    options.otherGenerators,
    "prisma-client-js"
  );

  const prismaClientDmmf = await getDMMF({
    datamodel: options.datamodel,
    previewFeatures: prismaClientGeneratorConfig?.previewFeatures
  });

  const generatorConfig = options.generator.config as GeneratorConfig;
  generatorConfig.seedsDir = resolve(
    process.cwd(),
    generatorConfig.seedsDir || `${dirname(options.schemaPath)}/seeds`
  );

  await Transformer.loadConfigFromDisk();
  Transformer.setConfig({ output: options.generator.output.value, ...generatorConfig });

  const transformer = new Transformer(
    prismaClientDmmf.datamodel.models,
    prismaClientDmmf.datamodel.enums,
    prismaClientDmmf.datamodel.types
  );
  transformer.prepare();
  transformer.convertToSchema();
  await transformer.saveToDisk();
  await Transformer.saveConfigToDisk();
};
