import { htmlDocumentForText } from "./html.js";

export function textToHtml(content) {
  return htmlDocumentForText(content);
}

export function textToMarkdown(content) {
  return String(content || "").trim();
}
