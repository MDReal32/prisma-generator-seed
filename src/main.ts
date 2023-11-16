import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

import { JSONSchema7, validate } from "json-schema";

import { PrismaClient } from "@prisma/client";

import { seedData } from "./core/seed-data";
import { Transformer } from "./core/transformer";
import { Seed } from "./types/seed";

const getAllSeeds = `SELECT * FROM "_prisma_migrations"`;

export const prisma = new PrismaClient();
(async () => {
  await prisma.$connect();

  const migratedSeeds = await prisma.$queryRawUnsafe<Seed[]>(getAllSeeds);
  await Transformer.loadConfigFromDisk();
  const config = Transformer.getConfig();
  const seeds = await readdir(config.seedsDir);

  const schemaFile = `${config.output}/schema.json`;
  const schema = JSON.parse(await readFile(schemaFile, "utf-8")) as JSONSchema7;

  for (const seed of seeds) {
    const seedPath = resolve(config.seedsDir, seed);
    const seedDataPiece = JSON.parse(await readFile(seedPath, "utf-8"));
    delete seedDataPiece["$schema"];
    const result = validate(seedDataPiece, schema);
    if (!result.valid) {
      throw new Error(`Seed "${seed}" is invalid.`);
    }
    await seedData(seedDataPiece, { name: seed, migratedSeeds });
  }
})()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
