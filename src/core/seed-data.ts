import * as crypto from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";

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
  const pureName = options.name.replace(extname(options.name), "");

  const foundSeed = options.migratedSeeds.find(({ migration_name }) =>
    migration_name.endsWith(pureName)
  );

  const config = Transformer.getConfig();
  const checksum = crypto.createHash("sha256").update(serialize(anySeed)).digest("hex");

  if (foundSeed) {
    const sha256FilePath = resolve(config.migrationsDir, foundSeed.migration_name, "seed.sha256");
    if (existsSync(sha256FilePath)) {
      const prevChecksum = await readFile(sha256FilePath, "utf-8").catch(() => null);
      if (prevChecksum === checksum) {
        console.log(`\x1b[2mSeed "${options.name}" seeded successfully before.\x1b[0m`);
        return;
      } else {
        throw new Error(`Seed "${options.name}" is invalid. Please rollback to previous seed.`);
      }
    }
  }

  const startedAt = new Date();
  const tables = Object.keys(anySeed);
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

  const date = new Date();
  const time = [
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
    date.getSeconds()
  ].join("");
  const seedName = `${time}_${pureName}`;

  const finishedAt = new Date();
  const newSha256FilePath = resolve(config.migrationsDir, seedName, "seed.sha256");

  await mkdir(resolve(dirname(newSha256FilePath)), { recursive: true });
  await writeFile(newSha256FilePath, checksum);
  await writeFile(resolve(config.migrationsDir, seedName, "migration.sql"), ``);

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
