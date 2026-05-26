import test from "node:test";
import assert from "node:assert/strict";

import { TaskQueue } from "./taskQueue.js";

test("TaskQueue runs jobs sequentially", async () => {
  const events = [];
  const queue = new TaskQueue();

  queue.enqueue("a", async () => {
    events.push("start-a");
    await new Promise((resolve) => setTimeout(resolve, 20));
    events.push("end-a");
  });

  queue.enqueue("b", async () => {
    events.push("start-b");
    events.push("end-b");
  });

  await queue.onIdle();
  assert.deepEqual(events, ["start-a", "end-a", "start-b", "end-b"]);
});

test("TaskQueue accepts waiting task while one is running", async () => {
  const events = [];
  const queue = new TaskQueue();

  queue.enqueue("first", async () => {
    events.push("first-running");
    queue.enqueue("second", async () => {
      events.push("second-running");
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
  });

  await queue.onIdle();
  assert.deepEqual(events, ["first-running", "second-running"]);
});
