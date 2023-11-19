import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { readFileSync } from "fs";
import { format, resolveConfig } from "prettier";
import { PartialDeep } from "type-fest";

import { AppConfig } from "../types/app-config";

export class Config {
  private static readonly configFile = resolve(
    process.cwd(),
    "node_modules/.prisma/seed/config.json"
  );
  private declare static config: AppConfig;

  static setConfig(config: PartialDeep<Config>) {
    this.config = { ...this.config, ...config };
  }

  static getConfig() {
    return this.config;
  }

  static async loadConfigFromDisk() {
    try {
      this.config = JSON.parse(await readFile(this.configFile, "utf-8"));
    } catch (e) {}
  }

  static loadConfigFromDiskSync() {
    try {
      this.config = JSON.parse(readFileSync(this.configFile, "utf-8"));
    } catch (e) {}
  }

  static async saveConfigToDisk() {
    await mkdir(dirname(this.configFile), { recursive: true });
    await writeFile(
      this.configFile,
      await format(JSON.stringify(this.config), {
        parser: "json",
        ...(await resolveConfig(".prettierrc"))
      })
    );
  }
}
