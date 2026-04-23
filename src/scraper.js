const axios = require('axios');
const cheerio = require('cheerio');

const SCRAPE_TIMEOUT = 15000;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * 抓取单个 URL 的页面文本内容
 */
async function scrapeUrl(url) {
  try {
    const response = await axios.get(url, {
      timeout: SCRAPE_TIMEOUT,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      maxRedirects: 5,
    });

    const $ = cheerio.load(response.data);

    // 移除无用标签
    $('script, style, nav, footer, header, iframe, noscript, svg').remove();

    // 提取主要内容
    const title = $('title').text().trim();
    const metaDesc = $('meta[name="description"]').attr('content') || '';
    const h1 = $('h1').first().text().trim();
    const bodyText = $('body').text().replace(/\s+/g, ' ').trim().substring(0, 8000);

    // 提取产品详情页链接（Shopify 集合页通用规则）
    const productLinks = [];
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (href && href.includes('/products/')) {
        const fullUrl = href.startsWith('http') ? href : new URL(href, url).href;
        if (!productLinks.includes(fullUrl)) {
          productLinks.push(fullUrl);
        }
      }
    });

    return {
      success: true,
      url,
      title,
      metaDesc,
      h1,
      bodyText,
      productLinks: [...new Set(productLinks)],
    };
  } catch (error) {
    return {
      success: false,
      url,
      error: error.message,
      productLinks: [],
    };
  }
}

/**
 * 批量抓取集合页及所有产品详情页
 * @param {string} collectionUrl - 集合页 URL
 * @param {boolean} skipProducts - 是否跳过产品详情页抓取（默认 false）
 */
async function scrapeCollection(collectionUrl, skipProducts = false) {
  const results = {};

  // 抓取集合页
  const collectionResult = await scrapeUrl(collectionUrl);
  results.collection = collectionResult;

  // 抓取产品详情页（如果未跳过）
  results.products = [];
  if (!skipProducts && collectionResult.success && collectionResult.productLinks.length > 0) {
    const productLinks = collectionResult.productLinks.slice(0, 30); // 最多30个产品
    for (const link of productLinks) {
      const productResult = await scrapeUrl(link);
      results.products.push(productResult);
      // 避免请求过快
      await new Promise(r => setTimeout(r, 500));
    }
  }

  return results;
}

module.exports = { scrapeUrl, scrapeCollection };