import { JSONSchema7, JSONSchema7Definition } from "json-schema";

export type ArrayOptions = Pick<JSONSchema7, "uniqueItems" | "minItems" | "maxItems">;
export type ObjectOptions = Pick<JSONSchema7, "required" | "additionalProperties">;

export class SchemaBuilder {
  protected oneOf(items: JSONSchema7Definition[]): JSONSchema7Definition {
    return { oneOf: items };
  }

  protected anyOf(items: JSONSchema7Definition[]): JSONSchema7Definition {
    return { anyOf: items };
  }

  protected allOf(items: JSONSchema7Definition[]): JSONSchema7Definition {
    return { allOf: items };
  }

  protected const(value: string): JSONSchema7Definition {
    return { const: value };
  }

  protected array<TItem extends JSONSchema7Definition>(
    items: TItem,
    options?: ArrayOptions
  ): JSONSchema7Definition {
    return { type: "array", items, ...options };
  }

  protected object(
    properties: Record<string, JSONSchema7Definition>,
    options?: ObjectOptions
  ): JSONSchema7Definition {
    return { type: "object", properties, ...options };
  }

  protected enum(values: string[]): JSONSchema7Definition {
    return this.string({ enum: values });
  }

  protected string(object: object = {}): JSONSchema7Definition {
    return { type: "string", ...object };
  }

  protected number(object: object = {}): JSONSchema7Definition {
    return { type: "number", ...object };
  }

  protected boolean(object: object = {}): JSONSchema7Definition {
    return { type: "boolean", ...object };
  }

  protected date(): JSONSchema7Definition {
    return this.string({ format: "date-time" });
  }

  protected json(): JSONSchema7Definition {
    return this.object({}, { additionalProperties: true });
  }

  protected bigint(): JSONSchema7Definition {
    return this.number({ pattern: "^[0-9]+$" });
  }

  protected bytes(): JSONSchema7Definition {
    return this.string({ pattern: "^[a-zA-Z0-9+/]+={0,2}$" });
  }

  protected decimal(): JSONSchema7Definition {
    return this.number({ pattern: "^[0-9]+\\.[0-9]+$" });
  }

  protected url(): JSONSchema7Definition {
    return this.string({ format: "uri" });
  }

  protected uuid() {
    return this.string({ pattern: "^[a-f0-9]{8}(-[a-f0-9]{4}){4}[a-f0-9]{8}$" });
  }

  protected ref($ref: string) {
    return { $ref };
  }
}
