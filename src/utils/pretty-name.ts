import { Config } from "./config";

export const prettyName = (model: string) => {
  const config = Config.getConfig();
  return config.prettyNames[model] || model;
};
