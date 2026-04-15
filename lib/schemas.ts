export function generateSchemaFromExample(json: string): string {
  try {
    const parsed = JSON.parse(json);
    const schema = inferSchema(parsed);
    return JSON.stringify(schema, null, 2);
  } catch {
    return '{\n  "type": "object"\n}';
  }
}

function inferSchema(value: unknown): Record<string, unknown> {
  if (value === null) {
    return { type: "null" };
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return { type: "array", items: {} };
    }
    return {
      type: "array",
      items: inferSchema(value[0]),
    };
  }

  switch (typeof value) {
    case "string":
      return { type: "string" };
    case "number":
      return Number.isInteger(value)
        ? { type: "integer" }
        : { type: "number" };
    case "boolean":
      return { type: "boolean" };
    case "object": {
      const obj = value as Record<string, unknown>;
      const properties: Record<string, unknown> = {};
      const required: string[] = [];

      for (const [key, val] of Object.entries(obj)) {
        properties[key] = inferSchema(val);
        required.push(key);
      }

      return {
        type: "object",
        properties,
        required,
      };
    }
    default:
      return {};
  }
}
