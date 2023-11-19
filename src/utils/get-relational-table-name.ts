import { Config } from "./config";
import { prettyName } from "./pretty-name";

export const getRelationalTableName = (table: string, field: string) => {
  const config = Config.getConfig();
  const tableName = prettyName(table);
  const found = config.relationalFields[`${tableName}#${field}`];

  if (!found) {
    return;
  }

  const [relationalTable] = found.split("#");
  return relationalTable;
};
