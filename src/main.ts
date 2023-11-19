import { existsSync } from "node:fs";
import { mkdir, readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

import { JSONSchema7, validate } from "json-schema";

import { PrismaClient } from "@prisma/client";

import { SeedData } from "./core/seed-data";
import { Seed } from "./types/seed";
import { codes } from "./utils/codes";
import { Config } from "./utils/config";

const getAllSeeds = `SELECT * FROM "_prisma_migrations"`;

export const prisma = new PrismaClient();

(async () => {
  await prisma.$connect();

  const migratedSeeds = await prisma.$queryRawUnsafe<Seed[]>(getAllSeeds);
  await Config.loadConfigFromDisk();
  const config = Config.getConfig();
  if (!existsSync(config.seedsDir)) await mkdir(config.seedsDir, { recursive: true });
  const seeds = await readdir(config.seedsDir);

  const schema = JSON.parse(await readFile(config.schemaFile, "utf-8")) as JSONSchema7;

  for (const seed of seeds) {
    const seedPath = resolve(config.seedsDir, seed);
    const seedDataPiece = JSON.parse(await readFile(seedPath, "utf-8"));
    delete seedDataPiece["$schema"];
    const result = validate(seedDataPiece, schema);
    if (!result.valid) {
      throw new Error(codes.S0001(seed));
    }
    await new SeedData(seedDataPiece, { name: seed, migratedSeeds }).execute();
  }
})()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
