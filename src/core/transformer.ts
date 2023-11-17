import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { inspect } from "node:util";

import { JSONSchema7, JSONSchema7Definition } from "json-schema";
import { format, resolveConfig } from "prettier";
import { PartialDeep } from "type-fest";

import { DMMF } from "@prisma/generator-helper";

import { codes } from "../utils/codes";

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
  migrationsDir: string;
  publishable: boolean;
  schemaFile: string;
  uniqueFields: Record<string, string[]>;
  relationalFields: Record<string, string>;
  relationalModels: Record<string, string[]>;
  prettyNames: Record<string, string>;
}

export class Config {
  private static readonly configFile = resolve(
    process.cwd(),
    "node_modules/.prisma/seed/config.json"
  );
  private declare static config: Config;

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

  static inspect(...data: any[]) {
    console.log(
      ...data.map(datum =>
        typeof datum === "object" ? inspect(datum, { depth: Infinity, colors: true }) : datum
      )
    );
  }
}

export class Transformer {
  private readonly schema: JSONSchema7 = { $schema: "http://json-schema.org/draft-07/schema" };

  private declare enumObjects: Record<string, DMMF.DatamodelEnum>;
  private disabledFields: Record<string, true> = {};

  private fields: Record<string, DMMF.Field> = {};
  private idFields: Record<string, DMMF.Field> = {};

  constructor(
    private readonly models: DMMF.Model[],
    private readonly enums: DMMF.DatamodelEnum[],
    private readonly types: DMMF.Model[]
  ) {}

  prepare() {
    const config = Config.getConfig();

    if (this.types.length) {
      console.warn(codes.S0005);
    }

    this.enumObjects = this.enums.reduce((acc, enumObject) => {
      acc[enumObject.name] = enumObject;
      return acc;
    }, {});

    const relationalFields: Record<string, string> = {};
    const relationalModels: Record<string, string[]> = {};
    const cache = new Map<string, DMMF.Field>();
    for (const model of this.models) {
      model.fields
        .map(field => {
          this.fields[`${model.name}#${field.name}`] = field;
          field.isId && (this.idFields[model.name] = field);
          return field;
        })
        .filter(field => field.kind === "object")
        .forEach(field => {
          if (!cache.has(field.relationName)) {
            return cache.set(field.relationName, field);
          }

          const cachedField = cache.get(field.relationName)!;
          const isFirstFieldRelationalCount =
            cachedField.relationFromFields.length + cachedField.relationToFields.length >
            field.relationFromFields.length + field.relationToFields.length;
          const [from, to] = isFirstFieldRelationalCount
            ? [cachedField, field]
            : [field, cachedField];

          relationalFields[`${to.type}#${from.name}`] = from.relationFromFields.map(
            field => `${from.type}#${field}`
          )[0];
          relationalFields[`${from.type}#${to.name}`] = from.relationToFields.map(
            field => `${to.type}#${field}`
          )[0];

          relationalModels[to.type] = relationalModels[to.type] || [];
          relationalModels[from.type] = relationalModels[from.type] || [];

          relationalModels[to.type].push(from.type);
          relationalModels[from.type].push(to.type);

          if (
            from.relationFromFields.length > 1 ||
            from.relationToFields.length > 1 ||
            to.relationFromFields.length > 1 ||
            to.relationToFields.length > 1
          ) {
            throw new Error(codes.S0009);
          }
        });
    }

    config.relationalFields = relationalFields;
    config.relationalModels = relationalModels;

    const uniqueFieldsObject: Record<string, string[]> = {};
    for (const model of this.models) {
      const uniqueFields = model.fields
        .filter(field => (field.isUnique || field.isId) && !this.isFieldDisabled(model, field))
        .map(field => field.name);

      if (uniqueFields.length) uniqueFieldsObject[model.name] = uniqueFields;
    }
    config.uniqueFields = uniqueFieldsObject;
  }

  convertToSchema() {
    this.schema.type = "object";
    this.schema.definitions = this.models.reduce((acc, model) => {
      const tableName = model.name;
      acc[tableName] = {
        item: this.convertModelToType(model),
        items: this.array(this.ref(`#/definitions/${tableName}/item`))
      };
      return acc;
    }, {});

    const config = Config.getConfig();
    config.prettyNames = {};
    this.schema.properties = this.models.reduce((acc, model) => {
      const tableName = model.name;
      const tablePrettyName = tableName.slice(0, 1).toLowerCase() + tableName.slice(1);
      config.prettyNames[tablePrettyName] = tableName;
      acc[tablePrettyName] = this.ref(`#/definitions/${tableName}/items`);
      return acc;
    }, {});

    this.schema.properties["$schema"] = this.url();

    this.schema.additionalProperties = false;
  }

  async saveToDisk() {
    const config = Config.getConfig();

    await mkdir(config.output, { recursive: true });
    await writeFile(
      config.schemaFile,
      await format(JSON.stringify(this.schema), {
        parser: "json",
        ...(await resolveConfig(".prettierrc"))
      })
    );
    await Config.saveConfigToDisk();
  }

  private convertModelToType(model: DMMF.Model): JSONSchema7Definition {
    return {
      type: "object",
      properties: model.fields.reduce((acc, field) => {
        if (!this.isFieldDisabled(model, field)) {
          const type = field.isId ? this.uuid() : this.convertFieldToType(field);
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
        return this.string();
      case "Int":
      case "Float":
        return this.number();
      case "Boolean":
        return this.boolean();
      case "DateTime":
        return this.date();
      case "Json":
        return this.json();
      case "BigInt":
        return this.bigint();
      case "Bytes":
        return this.bytes();
      case "Decimal":
        return this.decimal();
    }
  }

  private convertObjectFieldToType(field: DMMF.Field): JSONSchema7Definition {
    const relation = field.isList ? "items" : "item";
    return this.ref(`#/definitions/${field.type}/${relation}`);
  }

  private convertEnumFieldToType(field: DMMF.Field) {
    return this.enum(this.enumObjects[field.type].values.map(value => value.name));
  }

  private convertUnsupportedFieldToType(field: DMMF.Field): JSONSchema7Definition {
    throw new Error(codes.S0013(field.type));
  }

  private isFieldDisabled(model: DMMF.Model, field: DMMF.Field) {
    return !!this.disabledFields[`${model.name}#${field.name}`];
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

  private number(object: object = {}): JSONSchema7Definition {
    return { type: "number", ...object };
  }

  private boolean(object: object = {}): JSONSchema7Definition {
    return { type: "boolean", ...object };
  }

  private date(): JSONSchema7Definition {
    return this.string({ format: "date-time" });
  }

  private json(): JSONSchema7Definition {
    return this.object({}, { additionalProperties: true });
  }

  private bigint(): JSONSchema7Definition {
    return this.number({ pattern: "^[0-9]+$" });
  }

  private bytes(): JSONSchema7Definition {
    return this.string({ pattern: "^[a-zA-Z0-9+/]+={0,2}$" });
  }

  private decimal(): JSONSchema7Definition {
    return this.number({ pattern: "^[0-9]+\\.[0-9]+$" });
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
}
