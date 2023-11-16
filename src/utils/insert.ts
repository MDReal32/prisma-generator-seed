import { prisma } from "../main";
import { Seed } from "../types/seed";

export const insert = (seed: Seed) => {
  return prisma.$transaction(async prisma => {
    const sqlQuery = `
    INSERT INTO "_prisma_migrations" (
        "id", "checksum", "started_at", "finished_at",
        "logs", "migration_name", "rolled_back_at", "applied_steps_count"
    ) VALUES (
        '${seed.id}', '${seed.checksum}', '${seed.started_at.toISOString()}',
        '${seed.finished_at.toISOString()}', ${seed.logs ? `'${seed.logs}'` : "null"}, '${
          seed.migration_name
        }',
        ${seed.rolled_back_at ? `'${seed.rolled_back_at?.toISOString()}'` : "null"}, ${
          seed.applied_steps_count
        }
    );
`;

    await prisma.$queryRawUnsafe(sqlQuery);
  });
};
