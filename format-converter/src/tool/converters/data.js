import { arrayToCsv, parseScalar } from "./table.js";

export function parseJson(content) {
  return JSON.parse(content);
}

export function parseYaml(content) {
  const result = {};
  for (const line of String(content || "").split(/\r?\n/)) {
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const match = line.match(/^\s*([\w.-]+)\s*:\s*(.*)\s*$/);
    if (match) result[match[1]] = parseScalar(match[2]);
  }
  return result;
}

export function jsonToYaml(value, indent = 0) {
  if (Array.isArray(value)) {
    return value.map((item) => `${" ".repeat(indent)}- ${formatYamlValue(item, indent + 2)}`).join("\n");
  }
  if (value && typeof value === "object") {
    return Object.entries(value)
      .map(([key, val]) => {
        if (val && typeof val === "object") return `${" ".repeat(indent)}${key}:\n${jsonToYaml(val, indent + 2)}`;
        return `${" ".repeat(indent)}${key}: ${formatYamlValue(val, indent)}`;
      })
      .join("\n");
  }
  return formatYamlValue(value, indent);
}

export function jsonToCsv(value) {
  return arrayToCsv(value);
}

function formatYamlValue(value, indent) {
  if (value && typeof value === "object") return `\n${jsonToYaml(value, indent)}`;
  if (typeof value === "string") return /[:#\n]/.test(value) ? JSON.stringify(value) : value;
  return String(value);
}
