import test from "node:test";
import assert from "node:assert/strict";

import { buildChatCompletionsUrl, runOpenAiCompatPrompt } from "./openAiCompatRunner.js";

test("OpenAI compatible runner appends chat completions path", () => {
  assert.equal(
    buildChatCompletionsUrl("https://api.example.com/v1/"),
    "https://api.example.com/v1/chat/completions",
  );
  assert.equal(
    buildChatCompletionsUrl("https://api.example.com/v1/chat/completions"),
    "https://api.example.com/v1/chat/completions",
  );
});

test("OpenAI compatible runner returns assistant text", async () => {
  const requests = [];
  const result = await runOpenAiCompatPrompt({
    baseUrl: "https://api.example.com/v1",
    apiKey: "secret",
    model: "demo-model",
    prompt: "do work",
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return {
        ok: true,
        async json() {
          return { choices: [{ message: { content: "generated result" } }] };
        },
      };
    },
  });

  assert.equal(result, "generated result");
  assert.equal(requests[0].url, "https://api.example.com/v1/chat/completions");
  assert.match(requests[0].options.headers.Authorization, /secret/);
  assert.match(requests[0].options.body, /demo-model/);
});
