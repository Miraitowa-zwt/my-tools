const { chromium } = require('playwright');
const cheerio = require('cheerio');
const Redis = require('ioredis');
const ExcelJS = require('exceljs');

// Redis configuration with already has password from environment
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || '2387542221',
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
};

class FullSiteCrawler {
  constructor(startUrl, concurrency = 4) {
    this.startUrl = startUrl;
    this.baseDomain = new URL(startUrl).hostname;
    this.concurrency = concurrency;
    this.redis = new Redis(redisConfig);
    this.results = [];
    this.processedCount = 0;
    this.totalCount = 0;
  }

  async init() {
    // Clear existing queue for new crawl
    await this.redis.del('crawler:discovered');
    await this.redis.del('crawler:processed');
    await this.redis.sadd('crawler:discovered', this.startUrl);
    this.totalCount = 1;
  }

  normalizeUrl(url) {
    try {
      const parsed = new URL(url);
      // Remove hash, normalize case
      return parsed.hash = '';
      return parsed.toString().toLowerCase().replace(/\/$/, '');
    } catch (e) {
      return null;
    }
  }

  isSameDomain(url) {
    try {
      const domain = new URL(url).hostname;
      return domain === this.baseDomain;
    } catch (e) {
      return false;
    }
  }

  async checkLinkStatus(url) {
    let currentUrl = url;
    let redirects = [];
    let statusCode = null;
    const maxRedirects = 10;
    let count = 0;

    try {
      while (count < maxRedirects) {
        count++;
        const response = await fetch(currentUrl, {
          method: 'HEAD',
          redirect: 'manual',
        });

        statusCode = response.status;

        if (response.status === 301 || response.status === 302) {
          const location = response.headers.get('location');
          if (!location) break;
          
          let absoluteLocation = new URL(location, currentUrl).href;
          redirects.push(absoluteLocation);
          currentUrl = absoluteLocation;
        } else {
          break;
        }
      }

      return {
        statusCode,
        finalUrl: currentUrl,
        redirectCount: redirects.length,
        isRedirect: redirects.length > 0,
        is301or302: statusCode === 301 || statusCode === 302,
        is404: statusCode === 404,
      };
    } catch (e) {
      return {
        statusCode: null,
        finalUrl: null,
        redirectCount: 0,
        isRedirect: false,
        is301or302: false,
        is404: false,
        error: e.message,
      };
    }
  }

  async processPage(sourceUrl, browser) {
    console.log(`Processing: ${sourceUrl}`);
    
    const page = await browser.newPage();

    // Block unnecessary resources same as before
    await page.route('**/*', (route) => {
      const url = route.request().url().toLowerCase();
      const blockedExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', 
                                 '.css', '.font', '.woff', '.woff2', '.ttf', '.eot', 
                                 '.mp4', '.webm', '.avi', '.mov', '.flv'];
      
      const shouldBlock = blockedExtensions.some(ext => url.includes(ext));
      if (shouldBlock) {
        route.abort();
      } else {
        route.continue();
      }
    });

    try {
      await page.goto(sourceUrl, {
        waitUntil: 'networkidle',
        timeout: 30000,
      });
      await page.waitForTimeout(2000);

      const html = await page.content();
      const $ = cheerio.load(html);

      // Find all links
      const links = [];
      $('a').each((index, element) => {
        // Extract url from various attributes
        let href = 
          $(element).attr('href') || 
          $(element).attr('data-href') || 
          $(element).attr('data-url') || 
          $(element).attr('url') ||
          $(element).attr('onclick') || '';
        
        // Extract from onclick
        if (href.includes('location') || href.includes('href')) {
          const urlMatch = href.match(/https?:\/\/[^\s'\"]+/);
          if (urlMatch) {
            href = urlMatch[0];
          }
        }

        if (!href || href === '#' || href.startsWith('javascript:')) {
          return;
        }

        // Resolve relative url
        try {
          let absoluteUrl;
          if (href.startsWith('/')) {
            const urlObj = new URL(this.startUrl);
            absoluteUrl = urlObj.origin + href;
          } else if (!href.startsWith('http')) {
            const base = new URL(sourceUrl);
            const basePath = base.origin + base.pathname;
            absoluteUrl = new URL(href, basePath).href;
          } else {
            absoluteUrl = href;
          }

          // Normalize
          const normalized = this.normalizeUrl(absoluteUrl);
          if (!normalized) return;

          // Extract anchor text info
          const hasImage = $(element).find('img').length > 0;
          const text = $(element).text().trim();
          let altText = '';
          if (hasImage) {
            altText = $(element).find('img').first().attr('alt') || '';
          }

          let type;
          if (hasImage && text) {
            type = 'mixed';
          } else if (hasImage) {
            type = 'image';
          } else {
            type = 'text';
          }

          const anchorText = hasImage ? (altText || text) : text;

          links.push({
            url: normalized,
            anchorText: anchorText || '(no-text',
            anchorType: type,
          });
        } catch (e) {
          // Skip invalid urls
        }
      });

      // Mark current page as processed
      await this.redis.sadd('crawler:processed', this.normalizeUrl(sourceUrl));
      this.processedCount++;

      // Check each bad link and collect results
      for (const link of links) {
        // Add new discovered url if same domain and not discovered yet
        if (this.isSameDomain(link.url)) {
          const isNew = await this.redis.sismember('crawler:discovered', link.url);
          if (!isNew) {
            await this.redis.sadd('crawler:discovered', link.url);
            this.totalCount++;
          }
        }

        // Always check status even if it's external domain
        const status = await this.checkLinkStatus(link.url);

        // Collect result if it's 301/302 or 404
        if (status.is301or302 || status.is404) {
          this.results.push({
            sourceUrl,
            targetUrl: link.url,
            statusCode: status.statusCode,
            errorType: status.is404 ? '404 Not Found' : `${status.statusCode} Redirect`,
            finalUrl: status.finalUrl,
            anchorText: link.anchorText,
            anchorType: link.anchorType,
          });
        }
      }

      await page.close();
      return true;
    } catch (error) {
        console.error(`Error processing ${sourceUrl}:`, error.message);
        await page.close();

        // Mark as processed even if error
        await this.redis.sadd('crawler:processed', this.normalizeUrl(sourceUrl));
        this.processedCount++;
        return false;
      }
  }

  async startCrawl() {
    const browser = await chromium.launch({
      headless: true,
    });

    console.log(`Starting crawl of ${this.startUrl}`);
    console.log(`Base domain: ${this.baseDomain}, concurrency: ${this.concurrency}`);

    while (true) {
      // Get all unprocessed urls
      const allDiscovered = await this.redis.smembers('crawler:discovered');
      const allProcessed = await this.redis.smembers('crawler:processed');
      
      const unprocessed = allDiscovered.filter(url => !allProcessed.includes(url));
      
      if (unprocessed.length === 0) {
        console.log('Crawl complete!');
        break;
      }

      // Take up to concurrency number of urls to process
      const batch = unprocessed.slice(0, this.concurrency);
      
      // Process in parallel
      await Promise.all(batch.map(url => this.processPage(url, browser)));

      console.log(`Progress: ${this.processedCount} / ${this.totalCount}, found ${this.results.length} issues`);
    }

    await browser.close();
    await this.redis.disconnect();
    console.log(`Crawl finished. Total issues found: ${this.results.length}`);
    return this.results;
  }

  async exportToExcel(outputPath) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Broken Links');

    // Define columns
    worksheet.columns = [
      { header: '来源页面 URL', key: 'sourceUrl', width: 60 },
      { header: '问题链接 URL', key: 'targetUrl', width: 60 },
      { header: '状态码', key: 'statusCode', width: 12 },
      { header: '错误类型', key: 'errorType', width: 18 },
      { header: '最终跳转 URL', key: 'finalUrl', width: 60 },
      { header: '锚文本', key: 'anchorText', width: 30 },
      { header: '锚文本类型', key: 'anchorType', width: 14 },
    ];

    // Style header
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'E5E5E5' },
    };
    worksheet.getRow(1).height = 20;

    // Add data rows
    this.results.forEach(result => {
      const typeText = {
      text: '纯文本',
      image: '图片',
      mixed: '混合',
    }[result.anchorType];

      worksheet.addRow({
        sourceUrl: result.sourceUrl,
        targetUrl: result.targetUrl,
        statusCode: result.statusCode,
        errorType: result.errorType,
        finalUrl: result.finalUrl || '',
        anchorText: result.anchorText,
        anchorType: typeText,
      });
    });

    // Enable outline not needed here since each row is independent
    await workbook.xlsx.writeFile(outputPath);
    console.log(`Excel report saved to: ${outputPath}`);
  }
}

module.exports = FullSiteCrawler;
