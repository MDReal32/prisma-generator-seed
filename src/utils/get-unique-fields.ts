import { Config } from "./config";
import { prettyName } from "./pretty-name";

export const getUniqueFields = (model: string) => {
  const config = Config.getConfig();
  return config.uniqueFields[prettyName(model)];
};
