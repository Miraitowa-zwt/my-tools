import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

assert.match(html, /src="src\/app-standalone\.js"/);
assert.doesNotMatch(html, /type="module"/);
assert.match(html, /id="rich-input"/);
assert.match(html, /contenteditable="true"/);
assert.match(html, /class="rich-capture is-primary"/);
assert.match(html, /HTML 源码 \/ 纯文本编辑区/);
assert.ok(html.indexOf('id="rich-input"') < html.indexOf('id="input"'));

console.log("static page tests passed");
