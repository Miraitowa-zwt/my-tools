import { decodeEntities, escapeHtml } from "../utils/preview.js";

export function jsonToXml(value, rootName = "root") {
  if (Array.isArray(value)) return `<${rootName}>${value.map((item) => jsonToXml(item, "item")).join("")}</${rootName}>`;
  if (value && typeof value === "object") {
    return `<${rootName}>${Object.entries(value).map(([key, val]) => jsonToXml(val, key)).join("")}</${rootName}>`;
  }
  return `<${rootName}>${escapeHtml(String(value ?? ""))}</${rootName}>`;
}

export function xmlToJsonObject(content) {
  const text = String(content || "").trim();
  const match = text.match(/^<([\w:-]+)[^>]*>([\s\S]*)<\/\1>$/);
  if (!match) return { value: decodeEntities(text.replace(/<[^>]+>/g, "")) };
  return { [match[1]]: parseXmlChildren(match[2]) };
}

function parseXmlChildren(inner) {
  const childPattern = /<([\w:-]+)[^>]*>([\s\S]*?)<\/\1>/g;
  const result = {};
  let found = false;
  let match;
  while ((match = childPattern.exec(inner))) {
    found = true;
    result[match[1]] = /<[\w:-]+[^>]*>/.test(match[2]) ? parseXmlChildren(match[2]) : decodeEntities(match[2].trim());
  }
  return found ? result : decodeEntities(inner.trim());
}
