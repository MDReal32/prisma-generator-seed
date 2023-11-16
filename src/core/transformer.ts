import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { inspect } from "node:util";

import { JSONSchema7, JSONSchema7Definition } from "json-schema";
import { format, resolveConfig } from "prettier";
import { PartialDeep } from "type-fest";

import { DMMF } from "@prisma/generator-helper";

interface Fields {
  from: string[];
  to: string[];
  name: string;
}

interface TableField {
  table: string;
  field: string;
  fields: string[];
}

type RelationObject = {
  [K in keyof Omit<Fields, "name">]: TableField;
};

interface ArrayOptions {
  uniqueItems?: boolean;
  minItems?: number;
}

interface ObjectOptions {
  required?: string[];
  additionalProperties?: boolean;
}

export interface Config {
  output: string;
  seedsDir: string;
}

export class Transformer {
  private static readonly configFile = resolve(
    process.cwd(),
    "node_modules/.prisma/seed/config.json"
  );
  private declare static config: Config;

  private readonly schema: JSONSchema7 = { $schema: "http://json-schema.org/draft-07/schema" };

  private declare enumObjects: Record<string, DMMF.DatamodelEnum>;
  private disabledFields: TableField[] = [];
  private uniqueFields: Record<string, string[]> = {};
  private relations: Record<string, RelationObject[]> = {};

  private fields: Record<string, DMMF.Field> = {};
  private idFields: Record<string, DMMF.Field> = {};

  constructor(
    private readonly models: DMMF.Model[],
    private readonly enums: DMMF.DatamodelEnum[],
    private readonly types: DMMF.Model[]
  ) {}

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

  prepare() {
    if (this.types.length) {
      console.warn("Contact the developer of this package to implement support for types.");
    }

    this.enumObjects = this.enums.reduce((acc, enumObject) => {
      acc[enumObject.name] = enumObject;
      return acc;
    }, {});

    const cache = new Map<string, DMMF.Field>();
    for (const model of this.models) {
      model.fields
        .map(field => {
          this.fields[`${model.name}#${field.name}`] = field;
          if (field.isId) {
            this.idFields[model.name] = field;
          }
          return field;
        })
        .filter(field => field.kind === "object")
        .reduce(
          (acc, field) => {
            if (cache.has(field.relationName)) {
              acc.push([cache.get(field.relationName), field]);
            } else {
              cache.set(field.relationName, field);
            }
            return acc;
          },
          [] as [DMMF.Field, DMMF.Field][]
        )
        .map(([from, to]) =>
          from.relationFromFields.length + from.relationToFields.length >
          to.relationFromFields.length + to.relationToFields.length
            ? [from, to]
            : [to, from]
        )
        .forEach(([from, to]) => {
          this.relations[model.name] ||= [];
          this.relations[model.name].push({
            from: {
              table: from.type,
              field: from.name,
              fields: from.relationFromFields
            },
            to: {
              table: to.type,
              field: to.name,
              fields: from.relationToFields
            }
          });
          this.disabledFields.push({
            table: to.type,
            field: from.name,
            fields: from.relationFromFields
          });
        });
    }

    for (const model of this.models) {
      this.uniqueFields[model.name] = model.fields
        .filter(field => field.isUnique)
        .filter(field => {
          return !this.disabledFields.find(
            disabledField =>
              disabledField.fields.includes(field.name) && disabledField.table === model.name
          );
        })
        .map(field => field.name);
    }
  }

  convertToSchema() {
    this.schema.type = "object";
    this.schema.definitions = this.models.reduce((acc, model) => {
      const tableName = model.name;

      acc[tableName] = {
        item: this.convertModelToType(model),
        model: this.object(
          {
            data: this.array(this.ref(`#/definitions/${tableName}/item`)),
            upsertBy: this.array(
              this.enum([this.idFields[tableName].name, ...this.uniqueFields[tableName]]),
              { uniqueItems: true, minItems: 1 }
            )
          },
          { required: ["data"] }
        )
      };

      return acc;
    }, {});

    this.schema.properties = this.models.reduce((acc, model) => {
      const tableName = model.name;
      const tablePrettyName = tableName.slice(0, 1).toLowerCase() + tableName.slice(1);
      acc[tablePrettyName] = this.ref(`#/definitions/${tableName}/model`);
      return acc;
    }, {});

    this.schema.properties["$schema"] = this.url();

    this.schema.additionalProperties = false;
  }

  async saveToDisk() {
    const config = Transformer.getConfig();

    await mkdir(config.output, { recursive: true });
    await writeFile(
      `${config.output}/schema.json`,
      await format(JSON.stringify(this.schema), {
        parser: "json",
        ...(await resolveConfig(".prettierrc"))
      })
    );
  }

  private convertModelToType(model: DMMF.Model): JSONSchema7Definition {
    return {
      type: "object",
      properties: model.fields.reduce((acc, field) => {
        if (!field.isId && !this.isFieldDisabled(model, field)) {
          const type = this.convertFieldToType(field);
          if (type) {
            acc[field.name] = type;
          }
        }
        return acc;
      }, {}),
      additionalProperties: false
    };
  }

  private convertFieldToType(field: DMMF.Field) {
    switch (field.kind) {
      case "scalar":
        return this.convertScalarFieldToType(field);
      case "object":
        return this.convertObjectFieldToType(field);
      case "enum":
        return this.convertEnumFieldToType(field);
      case "unsupported":
        return this.convertUnsupportedFieldToType(field);
    }
  }

  private convertScalarFieldToType(field: DMMF.Field): JSONSchema7Definition {
    switch (field.type) {
      case "String":
        return { type: "string" };
      case "Int":
      case "Float":
        return { type: "number" };
      case "Boolean":
        return { type: "boolean" };
      case "DateTime":
        return { type: "integer" };
      case "Json":
        return { type: "object" };
      case "BigInt":
        return { type: "integer" };
      case "Bytes":
        return { type: "string" };
      case "Decimal":
        return { type: "number" };
    }
  }

  private convertObjectFieldToType(field: DMMF.Field): JSONSchema7Definition {
    return this.ref(`#/definitions/${field.type}/relation`);
  }

  private convertEnumFieldToType(field: DMMF.Field) {
    return this.enum(this.enumObjects[field.type].values.map(value => value.name));
  }

  private convertUnsupportedFieldToType(field: DMMF.Field): JSONSchema7Definition {
    throw new Error(`Unsupported field type: ${field.type}`);
  }

  private isFieldDisabled(model: DMMF.Model, field: DMMF.Field) {
    return this.disabledFields.find(
      disabledField =>
        disabledField.table === model.name && disabledField.fields.includes(field.name)
    );
  }

  private oneOf(items: JSONSchema7Definition[]): JSONSchema7Definition {
    return { oneOf: items };
  }

  private anyOf(items: JSONSchema7Definition[]): JSONSchema7Definition {
    return { anyOf: items };
  }

  private allOf(items: JSONSchema7Definition[]): JSONSchema7Definition {
    return { allOf: items };
  }

  private const(value: string): JSONSchema7Definition {
    return { const: value };
  }

  private array(items: any, options?: ArrayOptions): JSONSchema7Definition {
    return { type: "array", items, ...options };
  }

  private object(
    properties: Record<string, JSONSchema7Definition>,
    options?: ObjectOptions
  ): JSONSchema7Definition {
    return { type: "object", properties, ...options };
  }

  private enum(values: string[]): JSONSchema7Definition {
    return this.string({ enum: values });
  }

  private string(object: object = {}): JSONSchema7Definition {
    return { type: "string", ...object };
  }

  private url(): JSONSchema7Definition {
    return this.string({ format: "uri" });
  }

  private uuid() {
    return this.string({ pattern: "^[a-f0-9]{8}(-[a-f0-9]{4}){4}[a-f0-9]{8}$" });
  }

  private ref($ref: string) {
    return { $ref };
  }

  static inspect(...data: any[]) {
    data.forEach(datum => {
      console.log(inspect(datum, { depth: 10, colors: true }));
    });
  }
}
