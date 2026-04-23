require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { scrapeUrl, scrapeCollection } = require('./src/scraper');
const { buildPrompt } = require('./src/promptBuilder');
const { callGeminiStream } = require('./src/gemini');

const app = express();
const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ─── 路由：抓取单个 URL ───────────────────────────────────────
app.post('/api/scrape', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL 不能为空' });

  const result = await scrapeUrl(url);
  res.json(result);
});

// ─── 路由：抓取集合页（含所有产品详情页）────────────────────────
app.post('/api/scrape-collection', async (req, res) => {
  const { collection_url, website_url, competitor_urls, skip_products = false } = req.body;

  if (!collection_url) return res.status(400).json({ error: '集合页 URL 不能为空' });

  const results = {};

  // 抓取品牌官网
  if (website_url) {
    results.brand = await scrapeUrl(website_url);
  }

  // 抓取集合页 + 产品详情页
  const collectionData = await scrapeCollection(collection_url, skip_products);
  results.collection = collectionData.collection;
  if (!skip_products) {
    results.products = collectionData.products;
  }

  // 抓取竞品页
  if (competitor_urls && competitor_urls.length > 0) {
    results.competitors = [];
    for (const url of competitor_urls) {
      if (url.trim()) {
        const result = await scrapeUrl(url.trim());
        results.competitors.push(result);
      }
    }
  }

  res.json(results);
});

// ─── 路由：构建 Prompt（Prompt 模式）────────────────────────────
app.post('/api/build-prompt', async (req, res) => {
  const { variables, scrapedData, manualOverrides } = req.body;
  const prompt = buildPrompt(variables, scrapedData, manualOverrides);
  res.json({ prompt });
});

// ─── 路由：调用 Gemini（API 模式，流式）──────────────────────────
app.post('/api/generate', async (req, res) => {
  const { variables, scrapedData, manualOverrides } = req.body;

  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'Gemini API Key 未配置，请检查 .env 文件' });
  }

  const prompt = buildPrompt(variables, scrapedData, manualOverrides);

  // 设置 SSE 响应头
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  callGeminiStream(
    prompt,
    GEMINI_API_KEY,
    (chunk) => {
      res.write(`data: ${JSON.stringify({ type: 'chunk', text: chunk })}\n\n`);
    },
    () => {
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      res.end();
    },
    (error) => {
      res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
      res.end();
    }
  );
});

// ─── 启动服务 ─────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ 集合页文案工具已启动：http://localhost:${PORT}`);
  console.log(`📋 Gemini API Key: ${GEMINI_API_KEY ? '已配置 ✅' : '未配置 ❌'}`);
});