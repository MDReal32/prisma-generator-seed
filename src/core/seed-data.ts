import * as crypto from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { extname } from "node:path";

import { existsSync } from "fs";
import { v4 } from "uuid";

import { prisma } from "../main";
import { Seed } from "../types/seed";
import { insert } from "../utils/insert";
import { serialize } from "../utils/serialize";
import { Transformer } from "./transformer";

interface Data {
  data: any[];
  upsertBy: string[];
}

interface Options {
  name: string;
  migratedSeeds: Seed[];
}

export const seedData = async (anySeed: Record<string, Data>, options: Options) => {
  const date = new Date();
  const pureName = options.name.replace(extname(options.name), "");
  const time = [
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
    date.getSeconds()
  ].join("");

  const foundSeed = options.migratedSeeds.find(({ migration_name }) =>
    migration_name.endsWith(pureName)
  );
  const config = Transformer.getConfig();

  const seedName = `${time}_${pureName}`;
  const tables = Object.keys(anySeed);

  const checksum = crypto.createHash("sha256").update(serialize(anySeed)).digest("hex");

  if (foundSeed && existsSync(`${config.migrationsDir}/${foundSeed.migration_name}/seed.sha256`)) {
    const prevChecksum = await readFile(
      `${config.migrationsDir}/${foundSeed.migration_name}/seed.sha256`,
      "utf-8"
    ).catch(() => null);
    if (prevChecksum === checksum) {
      console.log(`\x1b[2mSeed "${options.name}" seeded successfully before.\x1b[0m`);
      return;
    } else {
      throw new Error(`Seed "${options.name}" is invalid. Please rollback to previous seed.`);
    }
  }

  const startedAt = new Date();
  await prisma.$transaction(async prisma => {
    for (const table of tables) {
      const values = anySeed[table];

      for (const datum of values.data) {
        if (values.upsertBy) {
          const where =
            values.upsertBy.reduce((acc, key) => {
              acc[key] = datum[key];
              return acc;
            }, {}) || {};

          await prisma[table].upsert({
            create: datum,
            update: datum,
            where: where as any
          });
        } else {
          try {
            await prisma[table].create({ data: datum });
          } catch (e) {
            if (e.code === "P2002") {
              return console.warn(
                `Please add "upsertBy" to "${table}" seed data for finding duplicates. We can't create duplicate data.`
              );
            }

            throw e;
          }
        }
      }
    }
  });

  const finishedAt = new Date();

  await mkdir(`./prisma/migrations/${seedName}`, { recursive: true });
  await writeFile(`./prisma/migrations/${seedName}/seed.sha256`, checksum);
  await writeFile(`./prisma/migrations/${seedName}/migration.sql`, ``);

  console.log(
    `\x1b[2mSeed "${options.name}" seeded successfully.\x1b[0m`,
    `\x1b[2mChecksum: ${checksum}\x1b[0m`
  );
  await insert({
    id: v4(),
    migration_name: seedName,
    started_at: startedAt,
    finished_at: finishedAt,
    applied_steps_count: 1,
    checksum: crypto.createHash("sha256").update(``).digest("hex"),
    logs: null,
    rolled_back_at: null
  });
};
