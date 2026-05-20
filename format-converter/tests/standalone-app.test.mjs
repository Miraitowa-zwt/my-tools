import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

class FakeElement {
  constructor() {
    this.disabled = false;
    this.value = "";
    this.textContent = "";
    this.dataset = {};
    this.listeners = {};
    this.classList = { toggle() {} };
    this.style = {};
  }

  addEventListener(name, callback) {
    this.listeners[name] = callback;
  }

  click() {
    this.listeners.click?.();
  }

  focus() {}

  select() {}

  remove() {}

  cloneNode() {
    const clone = new FakeElement();
    clone.innerHTML = this.innerHTML || "";
    return clone;
  }

  querySelectorAll() {
    return [];
  }
}

class FakeSelect extends FakeElement {
  constructor() {
    super();
    this.options = [];
  }

  set innerHTML(value) {
    this._innerHTML = value;
    this.options = [...String(value).matchAll(/<option value="([^"]+)">([^<]+)<\/option>/g)].map((match) => ({
      value: match[1],
      textContent: match[2],
    }));
    this.value = this.options[0]?.value || "";
  }

  get innerHTML() {
    return this._innerHTML || "";
  }
}

const elements = {
  "#input": new FakeElement(),
  "#rich-input": new FakeElement(),
  "#output": new FakeElement(),
  "#source-format": new FakeSelect(),
  "#target-format": new FakeSelect(),
  "#detected-format": new FakeElement(),
  "#convert": new FakeElement(),
  "#copy": new FakeElement(),
  "#download": new FakeElement(),
  "#preview": new FakeElement(),
  "#clear": new FakeElement(),
  "#swap": new FakeElement(),
  "#replace": new FakeElement(),
  "#message": new FakeElement(),
  "#preview-frame": new FakeElement(),
  ".panel-note": Object.assign(new FakeElement(), {
    textContent: "用于查看 HTML、表格和平台粘贴格式的实际显示效果。",
  }),
};

const samples = ["markdown", "csv", "json", "html", "sql"].map((name) =>
  Object.assign(new FakeElement(), { dataset: { sample: name } }),
);

const script = await readFile(new URL("../src/app-standalone.js", import.meta.url), "utf8");

const sandbox = {
  Blob: class Blob {
    constructor(parts, options) {
      this.parts = parts;
      this.options = options;
    }
  },
  URL: {
    createObjectURL() {
      return "blob:test";
    },
    revokeObjectURL() {},
  },
  DOMParser: class DOMParser {
    parseFromString(html) {
      const match = String(html).match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      const body = new FakeElement();
      body.innerHTML = (match?.[1] || html).trim();
      return { body };
    }
  },
  setTimeout(callback) {
    callback();
  },
  document: {
    body: {
      appendChild() {},
    },
    createElement() {
      return new FakeElement();
    },
    execCommand() {
      return true;
    },
    querySelector(selector) {
      return elements[selector] || null;
    },
    querySelectorAll(selector) {
      return selector === "[data-sample]" ? samples : [];
    },
  },
  navigator: {},
};

vm.createContext(sandbox);
vm.runInContext(script, sandbox, { filename: "app-standalone.js" });

assert.equal(elements["#source-format"].options.length, 10);
assert.equal(elements["#source-format"].options[0].textContent, "自动识别");
assert.equal(elements["#target-format"].options.length, 6);
assert.equal(elements["#target-format"].options[0].textContent, "纯净 HTML");
assert.match(elements["#input"].value, /产品更新/);
assert.equal(elements["#convert"].disabled, false);
assert.match(elements[".panel-note"].textContent, /实际显示效果/);

elements["#convert"].click();

assert.match(elements["#output"].value, /<h1>产品更新<\/h1>/);
assert.match(elements["#preview-frame"].srcdoc, /产品更新/);
assert.equal(elements["#copy"].disabled, false);

elements["#input"].value = "事项\n• Alpha\n• Beta\n\n姓名\t角色\nAlice\tSEO";
elements["#source-format"].value = "text";
elements["#target-format"].innerHTML = '<option value="html">HTML</option>';
elements["#target-format"].value = "html";
elements["#convert"].click();

assert.match(elements["#output"].value, /<ul>/);
assert.match(elements["#output"].value, /<li>Alpha<\/li>/);
assert.match(elements["#output"].value, /<table>/);
assert.match(elements["#output"].value, /<td>Alice<\/td>/);
assert.doesNotMatch(elements["#output"].value, /Alpha<br>• Beta/);

const pasteEvent = {
  prevented: false,
  preventDefault() {
    this.prevented = true;
  },
  clipboardData: {
    getData(type) {
      return type === "text/html" ? "<html><body><ul><li>Alpha</li></ul><table><tr><td>Alice</td></tr></table></body></html>" : "";
    },
  },
};

elements["#source-format"].value = "auto";
elements["#input"].listeners.paste(pasteEvent);

assert.equal(pasteEvent.prevented, true);
assert.equal(elements["#source-format"].value, "html");
assert.match(elements["#input"].value, /<ul><li>Alpha<\/li><\/ul>/);
assert.equal(elements["#target-format"].options[0].value, "html");
assert.equal(elements["#target-format"].options[0].textContent, "纯净 HTML");

elements["#rich-input"].innerHTML = "<h2>企微标题</h2><ul><li>任务</li></ul><table><tr><td>姓名</td></tr></table>";
elements["#rich-input"].listeners.input();

assert.equal(elements["#source-format"].value, "html");
assert.match(elements["#input"].value, /<h2>企微标题<\/h2>/);
assert.match(elements["#input"].value, /<table>/);
assert.equal(elements["#target-format"].options[0].value, "html");

elements["#input"].value = '<p class="x" style="color:red"><span>干净</span></p><script>bad()</script>';
elements["#source-format"].value = "html";
elements["#target-format"].innerHTML = '<option value="html">纯净 HTML</option>';
elements["#target-format"].value = "html";
elements["#convert"].click();

assert.equal(elements["#output"].value, "<p>干净</p>");

console.log("standalone app tests passed");
