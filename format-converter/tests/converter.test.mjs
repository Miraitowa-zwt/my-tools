import assert from "node:assert/strict";
import { convert, detectFormat, getAvailableTargets } from "../src/tool/index.js";

function output(content, from, to) {
  return convert({ content, from, to }).content.trim();
}

assert.equal(detectFormat("# 标题\n\n- A"), "markdown");
assert.equal(detectFormat("<h1>Title</h1>"), "html");
assert.equal(detectFormat('{"name":"Alice"}'), "json");
assert.equal(detectFormat("name,role\nAlice,SEO"), "csv");

assert.ok(getAvailableTargets("markdown").some((item) => item.value === "html"));
assert.ok(getAvailableTargets("html").some((item) => item.value === "markdown"));
assert.equal(getAvailableTargets("html")[0].value, "html");

{
  const html = output("# Demo\n\n- Alpha\n- Beta", "markdown", "html");
  assert.match(html, /<h1>Demo<\/h1>/);
  assert.match(html, /<li>Alpha<\/li>/);
}

{
  const html = output("事项\n• Alpha\n• Beta\n\n姓名\t角色\nAlice\tSEO\nBob\tOps", "text", "html");
  assert.match(html, /<p>事项<\/p>/);
  assert.match(html, /<ul>/);
  assert.match(html, /<li>Alpha<\/li>/);
  assert.match(html, /<table>/);
  assert.match(html, /<th>姓名<\/th>/);
  assert.match(html, /<td>Alice<\/td>/);
  assert.doesNotMatch(html, /Alpha<br>• Beta/);
}

{
  const html = output("| 姓名 | 角色 |\n| --- | --- |\n| Alice | SEO |", "markdown", "html");
  assert.match(html, /<table>/);
  assert.match(html, /<th>姓名<\/th>/);
  assert.match(html, /<td>Alice<\/td>/);
}

{
  const markdown = output("<h1>Demo</h1><p>Hello <strong>world</strong></p>", "html", "markdown");
  assert.match(markdown, /^# Demo/m);
  assert.match(markdown, /\*\*world\*\*/);
}

{
  const clean = output(
    '<div class="wecom" style="font-size:14px"><p style="color:red"><span data-x="1">标题</span></p><ul class="list"><li style="margin:0"><b>任务</b></li></ul><table style="width:100%"><tr><td style="border:1px solid red">姓名</td></tr></table><a href="javascript:alert(1)" onclick="bad()">坏链接</a><script>alert(1)</script></div>',
    "html",
    "html",
  );
  assert.match(clean, /<p>标题<\/p>/);
  assert.match(clean, /<ul><li><strong>任务<\/strong><\/li><\/ul>/);
  assert.match(clean, /<table><tr><td>姓名<\/td><\/tr><\/table>/);
  assert.match(clean, /<a>坏链接<\/a>/);
  assert.doesNotMatch(clean, /style=|class=|data-x|onclick|script|span|javascript:/);
}

{
  const table = output("name,role\nAlice,SEO\nBob,Ops", "csv", "markdown-table");
  assert.equal(table, "| name | role |\n| --- | --- |\n| Alice | SEO |\n| Bob | Ops |");
}

{
  const htmlTable = output("name\trole\nAlice\tSEO", "tsv", "html-table");
  assert.match(htmlTable, /<table>/);
  assert.match(htmlTable, /<td>Alice<\/td>/);
}

{
  const yaml = output('{"name":"Alice","active":true,"count":3}', "json", "yaml");
  assert.match(yaml, /name: Alice/);
  assert.match(yaml, /active: true/);
  assert.match(yaml, /count: 3/);
}

{
  const json = output("name: Alice\nactive: true\ncount: 3", "yaml", "json");
  assert.equal(json, '{\n  "name": "Alice",\n  "active": true,\n  "count": 3\n}');
}

{
  const json = output("<product><name>Mouse</name><price>29</price></product>", "xml", "json");
  assert.match(json, /"product"/);
  assert.match(json, /"name": "Mouse"/);
}

{
  const sql = output("select id,name from users where active=1 order by name", "sql", "formatted-sql");
  assert.match(sql, /^SELECT id,name/m);
  assert.match(sql, /\nFROM users/m);
  assert.match(sql, /\nWHERE active=1/m);
}

{
  const wechat = output("# Demo", "markdown", "wechat-html");
  assert.match(wechat, /<section/);
  assert.match(wechat, /<h1>Demo<\/h1>/);
}

console.log("converter tests passed");
