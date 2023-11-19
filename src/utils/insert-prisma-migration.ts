import * as crypto from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { prisma } from "../main";
import { Seed } from "../types/seed";
import { Config } from "./config";

export const insertPrismaMigration = (seed: Seed) => {
  return prisma.$transaction(async prisma => {
    const config = Config.getConfig();
    const newSha256FilePath = resolve(config.migrationsDir, seed.migration_name, "seed.sha256");

    const sqlQuery = `
    INSERT INTO "_prisma_migrations" (
        "id", "checksum", "started_at", "finished_at",
        "logs", "migration_name", "rolled_back_at", "applied_steps_count"
    ) VALUES (
        '${seed.id}',
        '${crypto.createHash("sha256").update(``).digest("hex")}',
        '${seed.started_at.toISOString()}',
        '${seed.finished_at.toISOString()}',
        ${seed.logs ? `'${seed.logs}'` : "null"},
        '${seed.migration_name}',
        ${seed.rolled_back_at ? `'${seed.rolled_back_at?.toISOString()}'` : "null"},
        ${seed.applied_steps_count}
    );
`;

    await prisma.$queryRawUnsafe(sqlQuery);
    await mkdir(resolve(dirname(newSha256FilePath)), { recursive: true });
    await writeFile(newSha256FilePath, seed.checksum);
    await writeFile(resolve(config.migrationsDir, seed.migration_name, "migration.sql"), ``);
  });
};
