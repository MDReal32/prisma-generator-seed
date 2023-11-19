import { mkdir, writeFile } from "node:fs/promises";

import { JSONSchema7, JSONSchema7Definition } from "json-schema";
import { format, resolveConfig } from "prettier";

import { DMMF } from "@prisma/generator-helper";

import { codes } from "../utils/codes";
import { Config } from "../utils/config";
import { SchemaBuilder } from "../utils/schema-builder";

export class Transformer extends SchemaBuilder {
  private readonly schema: JSONSchema7 = { $schema: "http://json-schema.org/draft-07/schema" };

  private declare enumObjects: Record<string, DMMF.DatamodelEnum>;
  private disabledFields: Record<string, true> = {};

  constructor(
    private readonly models: DMMF.Model[],
    private readonly enums: DMMF.DatamodelEnum[],
    private readonly types: DMMF.Model[]
  ) {
    super();
  }

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
    const primaryKeys: Record<string, string> = {};

    const cache = new Map<string, DMMF.Field>();
    for (const model of this.models) {
      model.fields
        .map(field => {
          field.isId && (primaryKeys[model.name] = field.name);
          return field;
        })
        .filter(field => field.kind === "object")
        .forEach(field => {
          field.relationFromFields.forEach(
            field => (this.disabledFields[`${model.name}#${field}`] = true)
          );

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
    config.primaryKeys = primaryKeys;

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
        item: this.convertModelToType(model, false),
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

  private convertModelToType(model: DMMF.Model, onlyUniques: boolean): JSONSchema7Definition {
    const properties = model.fields.reduce((acc, field) => {
      const isUnique = !onlyUniques || field.isUnique || field.isId || field.kind === "object";
      if (!this.isFieldDisabled(model, field) && isUnique) {
        const type = field.isId ? this.uuid() : this.convertFieldToType(field);
        if (type) {
          acc[field.name] = type;
        }
      }
      return acc;
    }, {});
    return this.object(properties, { additionalProperties: false });
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
}
