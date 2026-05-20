import { convert, detectFormat, formats, getAvailableTargets } from "./tool/index.js";
import { cleanHtml } from "./tool/converters/html.js";
import { copyText } from "./tool/utils/clipboard.js";
import { downloadText } from "./tool/utils/download.js";

const els = {
  input: document.querySelector("#input"),
  richInput: document.querySelector("#rich-input"),
  output: document.querySelector("#output"),
  source: document.querySelector("#source-format"),
  target: document.querySelector("#target-format"),
  detected: document.querySelector("#detected-format"),
  convert: document.querySelector("#convert"),
  copy: document.querySelector("#copy"),
  download: document.querySelector("#download"),
  preview: document.querySelector("#preview"),
  clear: document.querySelector("#clear"),
  swap: document.querySelector("#swap"),
  replace: document.querySelector("#replace"),
  message: document.querySelector("#message"),
  previewFrame: document.querySelector("#preview-frame"),
  sampleButtons: document.querySelectorAll("[data-sample]"),
};

let lastResult = null;

init();

function init() {
  renderSourceFormats();
  els.input.addEventListener("paste", handleRichPaste);
  els.input.addEventListener("input", () => {
    updateDetected();
    updateTargets();
  });
  els.richInput.addEventListener("paste", () => setTimeout(syncRichInput, 0));
  els.richInput.addEventListener("input", syncRichInput);
  els.source.addEventListener("change", updateTargets);
  els.convert.addEventListener("click", runConvert);
  els.copy.addEventListener("click", copyResult);
  els.download.addEventListener("click", downloadResult);
  els.preview?.addEventListener("click", previewResult);
  els.clear.addEventListener("click", clearAll);
  els.swap.addEventListener("click", swapResult);
  els.replace.addEventListener("click", replaceInput);
  els.sampleButtons.forEach((button) => button.addEventListener("click", () => loadSample(button.dataset.sample)));
  loadSample("markdown");
}

function handleRichPaste(event) {
  if (els.source.value !== "auto") return;
  const html = event.clipboardData?.getData("text/html");
  if (!html?.trim()) return;
  event.preventDefault();
  els.input.value = extractBodyHtml(html);
  els.source.value = "html";
  updateDetected();
  updateTargets();
  showMessage("已识别为富文本 HTML，可直接转换或清理。");
}

function extractBodyHtml(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return cleanRichHtml(doc.body || doc).trim();
}

function syncRichInput() {
  const html = cleanRichHtml(els.richInput);
  if (!html) return;
  els.input.value = html;
  els.source.value = "html";
  updateDetected();
  updateTargets();
  showMessage("已从富文本粘贴区读取 HTML。");
}

function cleanRichHtml(root) {
  const clone = root.cloneNode(true);
  clone.querySelectorAll("script, style, meta, link").forEach((node) => node.remove());
  clone.querySelectorAll("*").forEach((node) => {
    [...node.attributes].forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      const value = String(attribute.value || "").trim().toLowerCase();
      if (name.startsWith("on") || (name === "href" && value.startsWith("javascript:"))) {
        node.removeAttribute(attribute.name);
      }
    });
  });
  return cleanHtml(clone.innerHTML);
}

function renderSourceFormats() {
  els.source.innerHTML = formats.map((format) => `<option value="${format.value}">${format.label}</option>`).join("");
}

function updateDetected() {
  const detected = detectFormat(els.input.value);
  els.detected.textContent = detected.toUpperCase();
}

function updateTargets() {
  const source = getSource();
  const targets = getAvailableTargets(source);
  els.target.innerHTML = targets.map((target) => `<option value="${target.value}">${target.label}</option>`).join("");
  els.convert.disabled = !targets.length || !els.input.value.trim();
}

function getSource() {
  return els.source.value === "auto" ? detectFormat(els.input.value) : els.source.value;
}

function runConvert() {
  try {
    const result = convert({
      content: els.input.value,
      from: els.source.value,
      to: els.target.value,
    });
    lastResult = result;
    els.output.value = result.content;
    els.previewFrame.srcdoc = result.previewHtml;
    setActionsEnabled(true);
    showMessage(`已本地转换：${result.from.toUpperCase()} → ${result.to}`);
  } catch (error) {
    showMessage(error.userMessage || error.message || "转换失败，请检查输入内容。", true);
  }
}

async function copyResult() {
  if (!lastResult) return;
  await copyText(lastResult.content);
  showMessage("结果已复制。");
}

function downloadResult() {
  if (!lastResult) return;
  downloadText(lastResult.content, lastResult.filename, lastResult.mimeType);
  showMessage("结果已下载。");
}

function previewResult() {
  if (!lastResult) return;
  els.previewFrame.srcdoc = lastResult.previewHtml;
  showMessage("预览已更新。");
}

function clearAll() {
  els.input.value = "";
  els.richInput.innerHTML = "";
  els.output.value = "";
  els.previewFrame.srcdoc = "";
  lastResult = null;
  setActionsEnabled(false);
  updateDetected();
  updateTargets();
  showMessage("已清空。");
}

function swapResult() {
  if (!lastResult) return;
  els.input.value = lastResult.content;
  els.richInput.innerHTML = lastResult.to.includes("html") ? lastResult.content : "";
  els.source.value = "auto";
  updateDetected();
  updateTargets();
  showMessage("已把结果放回输入区。");
}

function replaceInput() {
  swapResult();
}

function setActionsEnabled(enabled) {
  els.copy.disabled = !enabled;
  els.download.disabled = !enabled;
  if (els.preview) els.preview.disabled = !enabled;
  els.swap.disabled = !enabled;
  els.replace.disabled = !enabled;
}

function showMessage(text, isError = false) {
  els.message.textContent = text;
  els.message.classList.toggle("is-error", isError);
}

function loadSample(name) {
  const samples = {
    markdown: "# 产品更新\n\n- 新增本地转换\n- 不需要 agent\n- 支持复制和下载",
    csv: "name,role,city\nAlice,SEO,Shanghai\nBob,Ops,Shenzhen",
    json: "{\"name\":\"Alice\",\"active\":true,\"count\":3}",
    html: "<h1>标题</h1><p>Hello <strong>world</strong></p>",
    sql: "select id,name from users where active=1 order by name",
  };
  els.input.value = samples[name] || samples.markdown;
  els.richInput.innerHTML = name === "html" ? samples.html : "";
  els.source.value = "auto";
  updateDetected();
  updateTargets();
  showMessage("示例已载入。");
}
