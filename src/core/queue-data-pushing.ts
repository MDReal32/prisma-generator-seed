import { prisma } from "../main";
import { getRelationalTableName } from "../utils/get-relational-table-name";
import { makeUniqueWhere } from "../utils/make-unique-where";
import { prettyNameModelMap } from "../utils/pretty-name-model-map";

class QueueDataPushing {
  private readonly paths = new Set<string>();

  getPaths() {
    return Array.from(this.paths);
  }

  async build<TData extends object>(table: string, data: TData, path: string): Promise<TData>;
  async build<TData extends Array<unknown>>(
    table: string,
    data: TData,
    path: string
  ): Promise<TData>;
  async build<TData>(table: string, data: TData | TData[], path: string = table) {
    const isArray = Array.isArray(data);
    const mapData = isArray ? data : [data];
    this.paths.add(path);

    const updatedMapData: TData[] = [];
    for (const datum of mapData) {
      const obj = {} as TData;
      for (let [key, value] of Object.entries(datum)) {
        const relationalTableName = getRelationalTableName(table, key);

        if (Array.isArray(value)) {
          const createdValues = [];
          const connectValues = [];
          for (let val of value) {
            const updatedValue = await this.build(relationalTableName, val, path);
            const uniqueWhere = makeUniqueWhere(relationalTableName, updatedValue);
            if (Object.keys(uniqueWhere).length <= 0) continue;
            const count = await prisma[prettyNameModelMap[relationalTableName]].count({
              where: uniqueWhere
            });
            (count > 0 ? connectValues : createdValues).push(updatedValue);
          }

          value = {};
          if (createdValues.length > 0) value.create = createdValues;
          if (connectValues.length > 0) value.connect = connectValues;
        } else if (value && typeof value === "object") {
          const updatedValue = await this.build(relationalTableName, value, `${path}.${key}`);
          const uniqueWhere = makeUniqueWhere(relationalTableName, updatedValue);
          const count = await prisma[prettyNameModelMap[relationalTableName]].count({
            where: uniqueWhere
          });
          value = { [count > 0 ? "connect" : "create"]: updatedValue };
        }

        obj[key] = value;
      }
      updatedMapData.push(obj);
    }

    return isArray ? updatedMapData : updatedMapData[0];
  }
}

export const queueDataPushing = async (table: string, data: unknown[]) => {
  const queue = new QueueDataPushing();
  const buildData = await queue.build(table, data, table);
  const paths = queue.getPaths();
  return { paths, data: buildData };
};
