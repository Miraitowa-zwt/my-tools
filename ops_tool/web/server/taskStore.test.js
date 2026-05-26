import test from "node:test";
import assert from "node:assert/strict";

import { TaskStore } from "./taskStore.js";

function makeTask(id, status) {
  return {
    id,
    label: id,
    domain: "https://example.com",
    cmsMode: "shopify",
    createdAt: new Date().toISOString(),
    status,
    progressText: status,
    logs: [],
    prompt: "",
    tdPrompt: "",
    generationMode: "prompt",
    apiModel: "",
    apiResult: "",
    tdApiResult: "",
    summary: null,
    outputDir: "",
    error: null,
    docxFileNames: [],
    keywordFileName: "",
  };
}

test("TaskStore deletes completed tasks from list and detail", () => {
  const store = new TaskStore();
  store.create(makeTask("done", "success"));
  store.create(makeTask("failed", "failed"));

  assert.equal(store.delete("done"), true);
  assert.equal(store.get("done"), null);
  assert.deepEqual(store.list().map((task) => task.id), ["failed"]);
});

test("TaskStore keeps TD prompt in completed task details", () => {
  const store = new TaskStore();
  store.create(makeTask("done", "running"));

  const task = store.markSuccess("done", {
    prompt: "batch prompt",
    td_prompt: "td prompt",
  });

  assert.equal(task.tdPrompt, "td prompt");
  assert.equal(store.list()[0].tdPrompt, "td prompt");
});

test("TaskStore keeps API results in completed task details", () => {
  const store = new TaskStore();
  store.create(makeTask("api", "running"));

  const task = store.markSuccess("api", {
    prompt: "batch prompt",
    td_prompt: "td prompt",
    api_result: "html result",
    td_api_result: "meta result",
  });

  assert.equal(task.apiResult, "html result");
  assert.equal(task.tdApiResult, "meta result");
});

test("TaskStore refuses to delete active tasks", () => {
  const store = new TaskStore();
  store.create(makeTask("running", "running"));
  store.create(makeTask("waiting", "waiting"));

  assert.equal(store.delete("running"), false);
  assert.equal(store.delete("waiting"), false);
  assert.deepEqual(store.list().map((task) => task.id), ["running", "waiting"]);
});
