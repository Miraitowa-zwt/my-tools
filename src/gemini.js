const axios = require('axios');

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const MODEL = 'gemini-2.5-pro-preview-03-25';

/**
 * 调用 Gemini API（流式输出）
 */
async function callGeminiStream(prompt, apiKey, onChunk, onDone, onError) {
  const url = `${GEMINI_API_BASE}/${MODEL}:streamGenerateContent?key=${apiKey}&alt=sse`;

  try {
    const response = await axios({
      method: 'post',
      url,
      data: {
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 65536,
          topP: 0.95,
        },
      },
      responseType: 'stream',
      timeout: 300000, // 5分钟超时
    });

    let buffer = '';

    response.data.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop(); // 保留不完整的行

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) onChunk(text);
          } catch (e) {
            // 忽略解析错误
          }
        }
      }
    });

    response.data.on('end', () => onDone());
    response.data.on('error', (err) => onError(err));
  } catch (error) {
    onError(error);
  }
}

/**
 * 调用 Gemini API（非流式，用于测试）
 */
async function callGemini(prompt, apiKey) {
  const url = `${GEMINI_API_BASE}/${MODEL}:generateContent?key=${apiKey}`;

  const response = await axios.post(url, {
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 65536,
      topP: 0.95,
    },
  });

  return response.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

module.exports = { callGeminiStream, callGemini };