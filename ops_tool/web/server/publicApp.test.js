import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

test("copy prompt action has fallback and visible feedback", async () => {
  const script = await fs.readFile(path.resolve("public", "app.js"), "utf-8");

  assert.match(script, /copyTextToClipboard/);
  assert.match(script, /execCommand\("copy"\)/);
  assert.match(script, /setCopyButtonText/);
  assert.match(script, /setCopyStatus/);
  assert.match(script, /已复制到剪贴板/);
  assert.match(script, /已选中 Prompt，请按 Ctrl\+C/);
});

test("TD prompt section is rendered and can be copied", async () => {
  const script = await fs.readFile(path.resolve("public", "app.js"), "utf-8");

  assert.match(script, /TD生成/);
  assert.match(script, /tdPrompt/);
  assert.match(script, /copy-td-prompt-button/);
  assert.match(script, /copyTdPrompt/);
});

test("API mode sends config and renders direct results", async () => {
  const script = await fs.readFile(path.resolve("public", "app.js"), "utf-8");

  assert.match(script, /generationMode/);
  assert.match(script, /apiBaseUrl/);
  assert.match(script, /apiKey/);
  assert.match(script, /apiModel/);
  assert.match(script, /API 生成结果/);
  assert.match(script, /apiResult/);
  assert.match(script, /tdApiResult/);
});

test("API article HTML results have quick copy actions", async () => {
  const script = await fs.readFile(path.resolve("public", "app.js"), "utf-8");

  assert.match(script, /extractHtmlBlocks/);
  assert.match(script, /renderHtmlCopyActions/);
  assert.match(script, /data-copy-html-index/);
  assert.match(script, /copyApiHtmlBlock/);
});

test("TD API result exposes candidate-group copy actions", async () => {
  const script = await fs.readFile(path.resolve("public", "app.js"), "utf-8");

  assert.match(script, /extractTdSections/);
  assert.match(script, /extractTdCandidateGroups/);
  assert.match(script, /renderTdCopyActions/);
  assert.match(script, /data-copy-td-candidate/);
  assert.match(script, /copyTdCandidate/);
  assert.match(script, /复制第 \${index \+ 1} 组 TD/);
  assert.doesNotMatch(script, /data-copy-td-section/);
  assert.doesNotMatch(script, /copyTdSection/);
});

test("TD API result does not render a copy-all button", async () => {
  const script = await fs.readFile(path.resolve("public", "app.js"), "utf-8");

  assert.doesNotMatch(script, /copy-td-api-result-button/);
  assert.doesNotMatch(script, /copyTdApiResult/);
  assert.doesNotMatch(script, /复制完整 TD/);
});

test("task detail refresh does not interrupt manual text selection", async () => {
  const script = await fs.readFile(path.resolve("public", "app.js"), "utf-8");

  assert.match(script, /shouldDeferTaskDetailRefresh/);
  assert.match(script, /selectable-text-region/);
  assert.match(script, /activeElement/);
  assert.match(script, /return;/);
});

test("task detail gives API results a primary area", async () => {
  const script = await fs.readFile(path.resolve("public", "app.js"), "utf-8");

  assert.match(script, /result-workbench/);
  assert.match(script, /supporting-details/);
  assert.match(script, /API 结果区/);
});

test("task cards can be selected with keyboard", async () => {
  const script = await fs.readFile(path.resolve("public", "app.js"), "utf-8");

  assert.match(script, /tabindex="0"/);
  assert.match(script, /aria-current/);
  assert.match(script, /taskList\.addEventListener\("keydown"/);
  assert.match(script, /event\.key === "Enter"/);
});

test("task detail text areas and logs are named for assistive tools", async () => {
  const script = await fs.readFile(path.resolve("public", "app.js"), "utf-8");

  assert.match(script, /aria-label="API 文章生成结果"/);
  assert.match(script, /aria-label="API TD 生成结果"/);
  assert.match(script, /aria-label="任务完整日志"/);
  assert.match(script, /tabindex="0"/);
});

test("API key is kept in local preferences", async () => {
  const script = await fs.readFile(path.resolve("public", "app.js"), "utf-8");

  assert.match(script, /ops-tool-api-key/);
  assert.match(script, /els\.apiKey\.value/);
});

test("task detail refresh preserves rich text scroll positions", async () => {
  const script = await fs.readFile(path.resolve("public", "app.js"), "utf-8");

  assert.match(script, /captureTaskDetailScroll/);
  assert.match(script, /restoreTaskDetailScroll/);
  assert.match(script, /scrollTop/);
  assert.match(script, /td-prompt-box/);
});

test("task form sends every selected Word file", async () => {
  const script = await fs.readFile(path.resolve("public", "app.js"), "utf-8");

  assert.match(script, /selectedDocxFiles: \[\]/);
  assert.match(script, /addDocxFiles/);
  assert.match(script, /state\.selectedDocxFiles\.map\(encodeFile\)/);
  assert.match(script, /docxFiles,/);
});

test("completed tasks have a manual delete action", async () => {
  const script = await fs.readFile(path.resolve("public", "app.js"), "utf-8");

  assert.match(script, /deleteTask/);
  assert.match(script, /DELETE/);
  assert.match(script, /删除任务/);
  assert.match(script, /status === "success" \|\| task\.status === "failed"/);
});

test("WeCom import helper script is removed", async () => {
  const script = await fs.readFile(path.resolve("public", "app.js"), "utf-8");

  assert.doesNotMatch(script, /openWecomDoc/);
  assert.doesNotMatch(script, /wecomImportStatus/);
  assert.doesNotMatch(script, /wecomDocUrl/);
  assert.doesNotMatch(script, /导出为 Word/);
});
