export function detectFormat(content) {
  const text = String(content || "").trim();
  if (!text) return "text";

  if (/^<!doctype\s+html/i.test(text) || /^<html[\s>]/i.test(text) || /^<[\w:-]+[\s>]/.test(text)) {
    return "html";
  }

  if ((text.startsWith("{") && text.endsWith("}")) || (text.startsWith("[") && text.endsWith("]"))) {
    try {
      JSON.parse(text);
      return "json";
    } catch {}
  }

  if (/^\s*(select|insert|update|delete|create|drop|alter|with)\s+/i.test(text)) return "sql";
  if (/^#{1,6}\s+\S/m.test(text) || /```[\s\S]*?```/.test(text) || /\[[^\]]+\]\([^)]+\)/.test(text)) return "markdown";

  const lines = text.split(/\r?\n/).filter(Boolean).slice(0, 5);
  if (lines.length >= 2) {
    const tabCount = (lines[0].match(/\t/g) || []).length;
    if (tabCount > 0 && tabCount === (lines[1].match(/\t/g) || []).length) return "tsv";
    const commaCount = (lines[0].match(/,/g) || []).length;
    if (commaCount > 0 && Math.abs((lines[1].match(/,/g) || []).length - commaCount) <= 1) return "csv";
  }

  if (/^[\w.-]+\s*:\s*\S/m.test(text) && !/<[\w:-]+[\s>]/.test(text)) return "yaml";
  return "text";
}
