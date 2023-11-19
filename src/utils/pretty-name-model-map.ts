import { Config } from "./config";

Config.loadConfigFromDiskSync();
const config = Config.getConfig();

export const prettyNameModelMap = Object.keys(config.prettyNames).reduce(
  (acc, key) => {
    acc[config.prettyNames[key]] = key;
    return acc;
  },
  {} as Record<string, string>
);
