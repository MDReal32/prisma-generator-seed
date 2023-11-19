import { dirname, resolve } from "node:path";

import { GeneratorOptions } from "@prisma/generator-helper";
import { getDMMF } from "@prisma/internals";

import { Transformer } from "./core/transformer";
import { Config } from "./utils/config";
import { getGeneratorConfigByProvider } from "./utils/get-generator-config-by-provider";

export const generate = async ({
  schemaPath,
  datamodel,
  otherGenerators,
  generator
}: GeneratorOptions) => {
  await Config.loadConfigFromDisk();
  const prismaClientGeneratorConfig = getGeneratorConfigByProvider(
    otherGenerators,
    "prisma-client-js"
  );

  const prismaClientDmmf = await getDMMF({
    datamodel,
    previewFeatures: prismaClientGeneratorConfig?.previewFeatures
  });

  const config: Config = {
    output: resolve(dirname(schemaPath), "json-schema"),
    publishable: false,
    schemaFile: resolve(process.cwd(), generator.output.value, "json-schema.json"),
    seedsDir: resolve(process.cwd(), dirname(schemaPath), "seeds"),
    migrationsDir: resolve(process.cwd(), dirname(schemaPath), "migrations"),
    prettyNames: {},
    relationalFields: {},
    relationalModels: {},
    uniqueFields: {},
    primaryKeys: {}
  };

  Config.setConfig(config);

  const transformer = new Transformer(
    prismaClientDmmf.datamodel.models,
    prismaClientDmmf.datamodel.enums,
    prismaClientDmmf.datamodel.types
  );
  transformer.prepare();
  transformer.convertToSchema();
  await transformer.saveToDisk();
};
