import * as crypto from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";

import { existsSync } from "fs";
import { v4 } from "uuid";

import { PrismaClientValidationError } from "@prisma/client/runtime/library";

import { prisma } from "../main";
import { Seed } from "../types/seed";
import { SeedDataOptions } from "../types/seed-data-options";
import { SeedDatum } from "../types/seed-datum";
import { codes } from "../utils/codes";
import { Config } from "../utils/config";
import { insertPrismaMigration } from "../utils/insert-prisma-migration";
import { serialize } from "../utils/serialize";
import { queueDataPushing } from "./queue-data-pushing";

export class SeedData {
  private readonly pureName: string;
  private readonly checksum: string;
  private readonly foundSeed: Seed;

  private startedAt: Date;
  private finishedAt: Date;

  constructor(
    private readonly seed: Record<string, unknown[]>,
    private readonly options: SeedDataOptions
  ) {
    this.pureName = this.options.name.replace(extname(this.options.name), "");

    this.foundSeed = this.options.migratedSeeds.find(({ migration_name }) =>
      migration_name.endsWith(this.pureName)
    );

    this.checksum = crypto.createHash("sha256").update(serialize(this.seed)).digest("hex");
  }

  async execute() {
    await this.pre();
    this.startedAt = new Date();
    await this.init();
    this.finishedAt = new Date();
    await this.post();
  }

  private async pre() {
    const config = Config.getConfig();
    if (this.foundSeed) {
      const sha256FilePath = resolve(
        config.migrationsDir,
        this.foundSeed.migration_name,
        "seed.sha256"
      );
      if (existsSync(sha256FilePath)) {
        const prevChecksum = await readFile(sha256FilePath, "utf-8").catch(() => null);
        if (prevChecksum === this.checksum) {
          console.log(`\x1b[2m${codes.S0003(this.options.name)}\x1b[0m`);
          return;
        } else {
          throw new Error(codes.S0002(this.options.name));
        }
      }
    }
  }

  private async init() {
    const tables = Object.keys(this.seed);
    const dataQueue: SeedDatum[] = [];

    for (const table of tables) {
      // console.log(`\x1b[2mSeeding "${table}" table...\x1b[0m`);
      const data = this.seed[table];
      const { paths, data: convertedData } = await queueDataPushing(table, data);
      dataQueue.push({ table, data: convertedData, paths });
    }

    await prisma.$transaction(async prisma => {
      for (const { table, data, paths } of dataQueue) {
        const dataArray = Array.isArray(data) ? data : [data];

        for (const datum of dataArray) {
          try {
            await prisma[table].create({ data: datum });
          } catch (error) {
            if (error instanceof PrismaClientValidationError) {
              const m = error.message.match(/Argument `(\w+)` is missing\./);
              if (m) {
                console.log(error);
                throw new Error(codes.S0014(m[1], this.options.name, paths.join("\n")));
              }
            }

            throw error;
          }
        }
      }
    });
  }

  private async post() {
    const date = new Date();
    const time = [
      date.getFullYear(),
      date.getMonth() + 1,
      date.getDate(),
      date.getHours(),
      date.getMinutes(),
      date.getSeconds()
    ].join("");
    const seedName = `${time}_${this.pureName}`;

    console.log(
      `\x1b[2mSeed "${this.options.name}" seeded successfully.\x1b[0m`,
      `\x1b[2mChecksum: ${this.checksum}\x1b[0m`
    );
    await insertPrismaMigration({
      id: v4(),
      migration_name: seedName,
      started_at: this.startedAt,
      finished_at: this.finishedAt,
      applied_steps_count: 1,
      checksum: this.checksum,
      logs: null,
      rolled_back_at: null
    });
  }
}
