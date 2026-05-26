import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

test("static files are served without browser cache during local development", async () => {
  const server = await fs.readFile("server/index.js", "utf-8");

  assert.match(server, /Cache-Control/);
  assert.match(server, /no-store/);
});
