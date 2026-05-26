import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

test("Word input allows selecting multiple files", async () => {
  const html = await fs.readFile(
    path.resolve("public", "index.html"),
    "utf-8",
  );

  assert.match(html, /id="docx-files"[^>]*multiple/);
  assert.match(html, /可一次选择多个/);
});

test("copy area has a visible status message region", async () => {
  const html = await fs.readFile(
    path.resolve("public", "index.html"),
    "utf-8",
  );

  assert.match(html, /id="copy-status"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /role="status"/);
  assert.match(html, /aria-atomic="true"/);
});

test("main work areas have accessible labels", async () => {
  const html = await fs.readFile(
    path.resolve("public", "index.html"),
    "utf-8",
  );

  assert.match(html, /aria-label="任务设置"/);
  assert.match(html, /aria-label="任务队列"/);
  assert.match(html, /aria-label="任务详情"/);
});

test("task form can choose direct API generation", async () => {
  const html = await fs.readFile(
    path.resolve("public", "index.html"),
    "utf-8",
  );

  assert.match(html, /id="generation-mode"/);
  assert.match(html, /value="prompt"/);
  assert.match(html, /value="api"/);
  assert.match(html, /id="api-base-url"/);
  assert.match(html, /id="api-key"/);
  assert.match(html, /id="api-model"/);
});

test("WeCom document import helper is removed", async () => {
  const html = await fs.readFile(
    path.resolve("public", "index.html"),
    "utf-8",
  );

  assert.doesNotMatch(html, /id="wecom-doc-url"/);
  assert.doesNotMatch(html, /id="open-wecom-doc-button"/);
  assert.doesNotMatch(html, /id="wecom-import-status"/);
  assert.doesNotMatch(html, /企微文档链接/);
});
