import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

test("page styles expose readable focus and responsive work areas", async () => {
  const styles = await fs.readFile(path.resolve("public", "styles.css"), "utf-8");

  assert.match(styles, /line-height:\s*1\.5/);
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /@media \(max-width: 1240px\)/);
  assert.match(styles, /\.task-card:focus-visible/);
});
