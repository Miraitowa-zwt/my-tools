export function buildChatCompletionsUrl(baseUrl) {
  const trimmed = String(baseUrl || "").trim().replace(/\/+$/, "");
  if (trimmed.endsWith("/chat/completions")) {
    return trimmed;
  }
  return `${trimmed}/chat/completions`;
}

function extractAssistantText(data) {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === "string" && content.trim()) {
    return content.trim();
  }
  throw new Error("API 没有返回可用内容");
}

export async function runOpenAiCompatPrompt({
  baseUrl,
  apiKey,
  model,
  prompt,
  fetchImpl = fetch,
}) {
  const response = await fetchImpl(buildChatCompletionsUrl(baseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || `API 请求失败 (${response.status})`;
    throw new Error(message);
  }

  return extractAssistantText(data);
}

export async function runOpenAiCompatTask(config, result) {
  const apiResult = await runOpenAiCompatPrompt({
    ...config,
    prompt: result.prompt,
  });
  const tdApiResult = await runOpenAiCompatPrompt({
    ...config,
    prompt: result.td_prompt,
  });

  return {
    ...result,
    api_result: apiResult,
    td_api_result: tdApiResult,
  };
}
