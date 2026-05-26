import test from "node:test";
import assert from "node:assert/strict";

import { buildPythonEnv, createUtf8LineBuffer } from "./pythonRunner.js";

test("Python runner forces UTF-8 output so prompt text stays readable", () => {
  const env = buildPythonEnv({ PATH: "demo" });

  assert.equal(env.PYTHONIOENCODING, "utf-8");
  assert.equal(env.PYTHONUTF8, "1");
  assert.equal(env.PATH, "demo");
});

test("UTF-8 line buffer preserves Chinese when bytes are split", () => {
  const lines = [];
  const buffer = createUtf8LineBuffer((line) => lines.push(line));
  const bytes = Buffer.from("Prompt：中文正常\n下一行", "utf-8");

  buffer.push(bytes.subarray(0, 10));
  buffer.push(bytes.subarray(10));
  buffer.end();

  assert.deepEqual(lines, ["Prompt：中文正常", "下一行"]);
});
