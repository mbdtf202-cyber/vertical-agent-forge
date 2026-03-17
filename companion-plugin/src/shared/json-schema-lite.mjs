function describePath(path) {
  return path.length === 0 ? "$" : `$${path}`;
}

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function pushError(errors, path, message) {
  errors.push({
    path: describePath(path),
    message,
  });
}

function validateEnum(schema, value, path, errors) {
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    pushError(errors, path, `Expected one of: ${schema.enum.join(", ")}`);
  }
}

function validateArray(schema, value, path, errors) {
  if (!Array.isArray(value)) {
    pushError(errors, path, "Expected array");
    return;
  }
  for (let index = 0; index < value.length; index += 1) {
    validateSchema(schema.items ?? {}, value[index], `${path}[${index}]`, errors);
  }
}

function validateNumber(schema, value, path, errors, integer = false) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    pushError(errors, path, integer ? "Expected integer" : "Expected number");
    return;
  }
  if (integer && !Number.isInteger(value)) {
    pushError(errors, path, "Expected integer");
    return;
  }
  if (typeof schema.minimum === "number" && value < schema.minimum) {
    pushError(errors, path, `Expected >= ${schema.minimum}`);
  }
  if (typeof schema.maximum === "number" && value > schema.maximum) {
    pushError(errors, path, `Expected <= ${schema.maximum}`);
  }
}

function validateObject(schema, value, path, errors) {
  if (!isObject(value)) {
    pushError(errors, path, "Expected object");
    return;
  }
  const properties = isObject(schema.properties) ? schema.properties : {};
  const required = Array.isArray(schema.required) ? schema.required : [];
  for (const key of required) {
    if (!(key in value)) {
      pushError(errors, `${path}.${key}`, "Missing required property");
    }
  }
  for (const [key, childValue] of Object.entries(value)) {
    if (!(key in properties)) {
      if (schema.additionalProperties === false) {
        pushError(errors, `${path}.${key}`, "Unexpected property");
      }
      continue;
    }
    validateSchema(properties[key], childValue, `${path}.${key}`, errors);
  }
}

export function validateSchema(schema, value, path = "", errors = []) {
  if (!schema || typeof schema !== "object") {
    return errors;
  }

  validateEnum(schema, value, path, errors);

  switch (schema.type) {
    case "object":
      validateObject(schema, value, path, errors);
      break;
    case "array":
      validateArray(schema, value, path, errors);
      break;
    case "string":
      if (typeof value !== "string") {
        pushError(errors, path, "Expected string");
      }
      break;
    case "integer":
      validateNumber(schema, value, path, errors, true);
      break;
    case "number":
      validateNumber(schema, value, path, errors, false);
      break;
    case "boolean":
      if (typeof value !== "boolean") {
        pushError(errors, path, "Expected boolean");
      }
      break;
    default:
      break;
  }

  return errors;
}
