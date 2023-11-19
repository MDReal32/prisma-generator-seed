import { Config } from "./config";

export const getPrimaryKey = (table: string) => {
  const config = Config.getConfig();
  const found = config.primaryKeys[table];

  if (!found) {
    throw new Error(`Primary key not found: ${table}`);
  }

  return found;
};
