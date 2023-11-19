import { getUniqueFields } from "./get-unique-fields";
import { prettyName } from "./pretty-name";

export const makeUniqueWhere = <TData>(table: string, data: TData) => {
  const uniqueFields = getUniqueFields(prettyName(table));
  return uniqueFields.reduce((acc, field) => {
    data[field] && (acc[field] = data[field]);
    return acc;
  }, {} as TData);
};
