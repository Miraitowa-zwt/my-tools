const axios = require('axios');
const cheerio = require('cheerio');
const pLimit = require('p-limit');
const chalk = require('chalk');
const { program } = require('commander');
const robotsParser = require('robots-parser');
const fs = require('fs');
const url = require('url');

class FourOhFourCrawler {
  constructor(startUrl, maxDepth, concurrency = 5, sitemapUrl = null, extraUrlsFile = null) {
    this.startUrl = startUrl;
    this.maxDepth = maxDepth;
    this.visited = new Set();
    this.queue = new Map();
    this.brokenLinks = [];
    this.concurrencyLimit = concurrency;
    this.limit = pLimit(concurrency);
    this.parsedStart = new URL(startUrl);
    this.domain = this.parsedStart.hostname;
    this.baseUrl = `${this.parsedStart.protocol}//${this.domain}`;
    this.robotsTxtUrl = `${this.baseUrl}/robots.txt`;
    this.sitemapUrl = sitemapUrl;
    this.extraUrlsFile = extraUrlsFile;
    this.robots = null;
    // 用于优先级评分的数据
    this.incomingLinks = new Map(); // brokenUrl -> array of source pages info
    this.pageDepths = new Map(); // url -> depth
    this.sitemapUrls = new Set(); // urls found in sitemap
  }

  async init() {
    try {
      const response = await axios.get(this.robotsTxtUrl, { timeout: 5000 });
      this.robots = robotsParser(this.robotsTxtUrl, response.data);
      console.log(chalk.blue(`ℹ 已加载 robots.txt`));
    } catch (error) {
      console.log(chalk.yellow(`⚠ 未找到 robots.txt 或加载失败，将继续爬取`));
    }

    // 处理额外URL文件
    await this.loadExtraUrls();

    // 处理Sitemap
    await this.loadSitemaps();
  }

  async loadExtraUrls() {
    if (!this.extraUrlsFile) {
      return;
    }

    try {
      const content = fs.readFileSync(this.extraUrlsFile, 'utf-8');
      const lines = content.split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'));
      
      let added = 0;
      for (const line of lines) {
        try {
          const normalized = this.normalizeUrl(this.baseUrl, line);
          if (normalized && this.isInternalLink(normalized) && !this.visited.has(normalized) && !this.queue.has(normalized)) {
            this.queue.set(normalized, { from: 'extra-urls-file', anchorText: '' });
            added++;
          }
        } catch (e) {
          // skip invalid URLs
        }
      }
      console.log(chalk.blue(`ℹ 从额外文件加载了 ${added} 个URL`));
    } catch (error) {
      console.log(chalk.yellow(`⚠ 读取额外URL文件失败 ${this.extraUrlsFile}: ${error.message}`));
    }
  }

  async loadSitemaps() {
    let sitemapUrls = [];

    if (this.sitemapUrl) {
      sitemapUrls = [this.sitemapUrl];
    } else {
      // 自动尝试常见sitemap位置
      sitemapUrls = [
        `${this.baseUrl}/sitemap.xml`,
        `${this.baseUrl}/sitemap_index.xml`
      ];
    }

    let allUrls = [];
    for (const sitemapUrl of sitemapUrls) {
      try {
        const urls = await this.parseSitemap(sitemapUrl);
        allUrls = allUrls.concat(urls);
        if (urls.length > 0) {
          console.log(chalk.blue(`ℹ 从 ${sitemapUrl} 解析出 ${urls.length} 个URL`));
        }
      } catch (error) {
        if (this.sitemapUrl) {
          console.log(chalk.yellow(`⚠ 解析sitemap失败 ${sitemapUrl}: ${error.message}`));
        }
      }
    }

    // 去重并添加到队列
    let added = 0;
    for (const url of allUrls) {
      if (this.isInternalLink(url) && !this.visited.has(url) && !this.queue.has(url)) {
        this.queue.set(url, { from: 'sitemap', anchorText: '' });
        added++;
      }
    }

    if (added > 0) {
      console.log(chalk.blue(`ℹ 从sitemap添加 ${added} 个URL到检测队列`));
    }
  }

  async parseSitemap(sitemapUrl) {
    const response = await axios.get(sitemapUrl, { timeout: 10000 });
    const $ = cheerio.load(response.data, { xmlMode: true });
    const urls = [];

    // 检查是否是 sitemap index
    const sitemaps = $('sitemap > loc');
    if (sitemaps.length > 0) {
      // 递归解析子sitemap
      const subSitemapUrls = [];
      sitemaps.each((i, el) => {
        const loc = $(el).text().trim();
        if (loc) {
          subSitemapUrls.push(loc);
        }
      });

      for (const subUrl of subSitemapUrls) {
        try {
          const subUrls = await this.parseSitemap(subUrl);
          urls.push(...subUrls);
        } catch (error) {
          console.log(chalk.yellow(`⚠ 解析子sitemap失败 ${subUrl}: ${error.message}`));
        }
      }
      return urls;
    }

    // 普通sitemap，解析loc标签
    $('url > loc').each((i, el) => {
      const loc = $(el).text().trim();
      if (loc) {
        try {
          const normalized = this.normalizeUrl(sitemapUrl, loc);
          if (normalized) {
            urls.push(normalized);
            this.sitemapUrls.add(normalized);
          }
        } catch (e) {
          // skip invalid URLs
        }
      }
    });

    return urls;
  }

  isAllowed(urlToCheck) {
    if (!this.robots) return true;
    return this.robots.isAllowed('*', urlToCheck);
  }

  isInternalLink(targetUrl) {
    try {
      const parsed = new URL(targetUrl);
      return parsed.hostname === this.domain;
    } catch (e) {
      return false;
    }
  }

  normalizeUrl(baseUrl, link) {
    try {
      const fullUrl = new URL(link, baseUrl);
      // 移除hash片段，去除末尾斜杠标准化
      fullUrl.hash = '';
      let normalized = fullUrl.toString();
      if (normalized.endsWith('/') && normalized.length > 1) {
        normalized = normalized.slice(0, -1);
      }
      return normalized;
    } catch (e) {
      return null;
    }
  }

  detectSoft404(htmlContent) {
    const $ = cheerio.load(htmlContent);
    
    // 检测规则1: title包含404相关关键词
    const title = $('title').text().toLowerCase().trim();
    const soft404Keywords = ['404', 'not found', 'page not found', '找不到', '页面不存在', '不存在'];
    const hasSoft404Keyword = soft404Keywords.some(keyword => title.includes(keyword));
    
    if (hasSoft404Keyword) {
      return true;
    }

    // 检测规则3: meta robots noindex
    const metaRobots = $('meta[name="robots"]').attr('content');
    if (metaRobots && metaRobots.toLowerCase().includes('noindex')) {
      return true;
    }

    // 检测规则2: 正文文字少于50字
    // 去除所有标签提取纯文本
    const text = $.root().text().replace(/\s+/g, ' ').trim();
    const wordCount = text.length;
    if (wordCount < 50) {
      return true;
    }

    return false;
  }

  async checkUrl(targetUrl, fromUrl, anchorText) {
    if (!this.isAllowed(targetUrl)) {
      console.log(chalk.gray(`⏭  跳过被 robots.txt 禁止: ${targetUrl}`));
      return;
    }

    try {
      const result = await this.followRedirects(targetUrl);
      const { finalUrl, statusCode, redirectChain } = result;

      // 对于 200 响应，检查是否是 Soft 404
      if (statusCode >= 200 && statusCode < 400) {
        let isSoft404 = false;
        
        // 获取页面内容进行 Soft 404 检测
        try {
          const pageResponse = await axios.get(finalUrl, { timeout: 10000 });
          isSoft404 = this.detectSoft404(pageResponse.data);
        } catch (e) {
          // 如果获取页面失败，不判定为 Soft 404
          isSoft404 = false;
        }

        if (isSoft404) {
          console.log(chalk.red.bold(`✗ Soft 404 ${targetUrl}`));
          this.brokenLinks.push({
            brokenUrl: targetUrl,
            statusCode: statusCode,
            fromUrl: fromUrl,
            anchorText: anchorText.trim(),
            finalUrl: finalUrl,
            redirectChain: redirectChain,
            issue_type: 'soft_404'
          });
        } else {
          console.log(chalk.green(`✓ ${statusCode} ${targetUrl}`));
        }
        return result;
      } else if (statusCode === 404 || statusCode >= 400) {
        // 硬 404 和其他 4xx 错误
        console.log(chalk.red.bold(`✗ ${statusCode} ${targetUrl}`));
        this.brokenLinks.push({
          brokenUrl: targetUrl,
          statusCode: statusCode,
          fromUrl: fromUrl,
          anchorText: anchorText.trim(),
          finalUrl: finalUrl,
          redirectChain: redirectChain,
          issue_type: 'hard_404'
        });
        return result;
      } else {
        console.log(chalk.yellow(`⚠ ${statusCode} ${targetUrl}`));
        return result;
      }
    } catch (error) {
      const statusCode = error.response?.status || -1;
      console.log(chalk.red(`✗ ${statusCode} ${targetUrl} - ${error.message}`));
      this.brokenLinks.push({
        brokenUrl: targetUrl,
        statusCode: statusCode,
        fromUrl: fromUrl,
        anchorText: anchorText.trim(),
        error: error.message,
        issue_type: 'hard_404'
      });
      return {
        finalUrl: targetUrl,
        statusCode: statusCode,
        redirectChain: []
      };
    }
  }

  async followRedirects(startUrl, maxRedirects = 10) {
    let currentUrl = startUrl;
    const redirectChain = [];
    let redirectCount = 0;

    while (redirectCount < maxRedirects) {
      try {
        const response = await axios.head(currentUrl, {
          timeout: 10000,
          maxRedirects: 0,
          validateStatus: () => true
        });

        const status = response.status;

        if (status === 301 || status === 302 || status === 307 || status === 308) {
          const location = response.headers.location;
          if (!location) {
            return {
              finalUrl: currentUrl,
              statusCode: status,
              redirectChain
            };
          }
          const nextUrl = new URL(location, currentUrl).href;
          redirectChain.push({ from: currentUrl, to: nextUrl, statusCode: status });
          currentUrl = nextUrl;
          redirectCount++;
        } else {
          return {
            finalUrl: currentUrl,
            statusCode: status,
            redirectChain
          };
        }
      } catch (error) {
        if (error.response) {
          return {
            finalUrl: currentUrl,
            statusCode: error.response.status,
            redirectChain
          };
        }
        throw error;
      }
    }

    return {
      finalUrl: currentUrl,
      statusCode: -1,
      redirectChain,
      error: 'Too many redirects'
    };
  }

  async crawlPage(currentUrl, currentDepth) {
    if (this.visited.has(currentUrl) || currentDepth > this.maxDepth) {
      return;
    }

    this.visited.add(currentUrl);
    this.pageDepths.set(currentUrl, currentDepth);

    try {
      const response = await axios.get(currentUrl, {
        timeout: 10000,
        validateStatus: () => true
      });

      if (response.status >= 400) {
        console.log(chalk.yellow(`⚠ ${response.status} ${currentUrl}`));
        return;
      }

      console.log(chalk.blue(`↻ 爬取 [深度 ${currentDepth}/${this.maxDepth}]: ${currentUrl}`));

      const contentType = response.headers['content-type'] || '';
      if (!contentType.includes('text/html')) {
        return;
      }

      const $ = cheerio.load(response.data);
      const links = [];

       $('a[href]').each((i, el) => {
        const href = $(el).attr('href');
        const anchorText = $(el).text();
        const normalizedUrl = this.normalizeUrl(currentUrl, href);

        if (normalizedUrl && this.isInternalLink(normalizedUrl)) {
          // 检测链接是否在导航栏或footer中
          let isInNavOrFooter = false;
          let $parent = $(el);
          for (let level = 0; level < 5; level++) {
            const tagName = $parent[0]?.name?.toLowerCase() || '';
            const className = ($parent.attr('class') || '').toLowerCase();
            const id = ($parent.attr('id') || '').toLowerCase();
            
            if (tagName === 'nav' || 
                className.includes('nav') || 
                className.includes('menu') || 
                className.includes('footer') ||
                id.includes('nav') || 
                id.includes('menu') || 
                id.includes('footer') ||
                tagName === 'footer') {
              isInNavOrFooter = true;
              break;
            }
            if (!$parent.parent().length) break;
            $parent = $parent.parent();
          }

          links.push({
            url: normalizedUrl,
            anchorText: anchorText,
            isInNavOrFooter: isInNavOrFooter
          });

          // 记录入链信息用于优先级评分
          if (!this.incomingLinks.has(normalizedUrl)) {
            this.incomingLinks.set(normalizedUrl, []);
          }
          this.incomingLinks.get(normalizedUrl).push({
            fromUrl: currentUrl,
            depth: currentDepth,
            isInNavOrFooter: isInNavOrFooter
          });
        }
      });

      const checkTasks = links.map(link => {
        return this.limit(() => {
          if (!this.visited.has(link.url) && !this.queue.has(link.url)) {
            this.queue.set(link.url, { from: currentUrl, anchorText: link.anchorText });
          }
          return this.checkUrl(link.url, currentUrl, link.anchorText);
        });
      });

      await Promise.all(checkTasks);

      if (currentDepth < this.maxDepth) {
        const crawlTasks = [];
        for (const [nextUrl, info] of this.queue) {
          if (!this.visited.has(nextUrl)) {
            this.queue.delete(nextUrl);
            crawlTasks.push(this.limit(() => 
              this.crawlPage(nextUrl, currentDepth + 1)
            ));
          }
        }
        await Promise.all(crawlTasks);
      }

    } catch (error) {
      console.log(chalk.red(`✗ 爬取失败 ${currentUrl}: ${error.message}`));
    }
  }

  async start() {
    await this.init();
    console.log(chalk.bold.blue(`\n🚀 开始爬取: ${this.startUrl}`));
    console.log(chalk.bold.blue(`📏 最大深度: ${this.maxDepth}`));
    console.log(chalk.bold.blue(`⚡ 并发数: ${this.concurrencyLimit}\n`));

    // 如果sitemap已经提供了URL，先检查它们
    if (this.queue.size > 0) {
      console.log(chalk.blue(`ℹ 开始检测队列中 ${this.queue.size} 个预加载URL...`));
      const checkTasks = [];
      for (const [url, info] of this.queue) {
        checkTasks.push(this.limit(() => 
          this.checkUrl(url, info.from, info.anchorText)
        ));
      }
      await Promise.all(checkTasks);
    }

    // 从起始URL开始递归爬取
    await this.crawlPage(this.startUrl, 0);

    // 检查队列中剩余的URL
    if (this.queue.size > 0) {
      console.log(chalk.blue(`ℹ 继续检测剩余 ${this.queue.size} 个URL...`));
      const remainingTasks = [];
      for (const [url, info] of this.queue) {
        if (!this.visited.has(url)) {
          remainingTasks.push(this.limit(() => 
            this.crawlPage(url, this.maxDepth)
          ));
        }
      }
      await Promise.all(remainingTasks);
    }

    console.log(chalk.bold.green(`\n✅ 爬取完成！`));
    console.log(chalk.bold(`📊 统计:
  - 已检查页面: ${this.visited.size}
  - 发现死链: ${this.brokenLinks.length}
`));

    if (this.brokenLinks.length > 0) {
      this.calculatePriorities();
      this.saveReport();
    } else {
      console.log(chalk.green.bold(`🎉 未发现404死链！`));
    }
  }

  calculatePriorities() {
    for (const brokenLink of this.brokenLinks) {
      const score = this.calculatePriorityScore(brokenLink.brokenUrl);
      brokenLink.priority_score = score;
      brokenLink.priority = this.getPriorityLevel(score);
    }

    // 按优先级降序排序
    this.brokenLinks.sort((a, b) => b.priority_score - a.priority_score);
  }

  calculatePriorityScore(brokenUrl) {
    let score = 0;

    // 1. inlinks_count - 链接到这个404的页面数量
    const inlinks = this.incomingLinks.get(brokenUrl) || [];
    const count = inlinks.length;
    
    if (count >= 10) {
      score += 40;
    } else if (count >= 5) {
      score += 25;
    } else if (count >= 2) {
      score += 15;
    } else if (count >= 1) {
      score += 5;
    }

    // 2. 来源页面重要性
    let hasShallowSource = false;
    let hasNavOrFooter = false;
    let hasAnySource = false;

    for (const inlink of inlinks) {
      hasAnySource = true;
      if (inlink.depth <= 1) {
        hasShallowSource = true;
      }
      if (inlink.isInNavOrFooter) {
        hasNavOrFooter = true;
      }
    }

    if (hasShallowSource) {
      score += 25;
    }
    if (hasNavOrFooter) {
      score += 15;
    }
    if (hasAnySource && !hasShallowSource && !hasNavOrFooter) {
      score += 5;
    }

    // 如果没有来源信息（来自sitemap直接检测），默认给5分
    if (!hasAnySource) {
      score += 5;
    }

    // 3. URL 深度 - 该404 URL的层级
    const urlDepth = this.pageDepths.get(brokenUrl);
    if (urlDepth !== undefined) {
      if (urlDepth <= 2) {
        score += 15;
      } else if (urlDepth <= 4) {
        score += 8;
      } else {
        score += 3;
      }
    } else {
      // 如果没被爬取到（只在sitemap中），从路径计算深度
      try {
        const parsed = new URL(brokenUrl);
        const pathSegments = parsed.pathname.split('/').filter(s => s.length > 0);
        const pathDepth = pathSegments.length;
        if (pathDepth <= 2) {
          score += 15;
        } else if (pathDepth <= 4) {
          score += 8;
        } else {
          score += 3;
        }
      } catch (e) {
        score += 3;
      }
    }

    // 4. 是否在 Sitemap 中出现
    if (this.sitemapUrls.has(brokenUrl)) {
      score += 10;
    }

    return Math.min(score, 100);
  }

  getPriorityLevel(score) {
    if (score >= 80) {
      return 'critical';
    } else if (score >= 60) {
      return 'high';
    } else if (score >= 40) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  saveReport() {
    const report = {
      startUrl: this.startUrl,
      maxDepth: this.maxDepth,
      concurrency: this.concurrencyLimit,
      sitemapUrl: this.sitemapUrl,
      extraUrlsFile: this.extraUrlsFile,
      crawledPages: this.visited.size,
      brokenLinksCount: this.brokenLinks.length,
      brokenLinks: this.brokenLinks,
      generatedAt: new Date().toISOString()
    };

    fs.writeFileSync('report.json', JSON.stringify(report, null, 2), 'utf-8');
    console.log(chalk.bold.blue(`📄 报告已保存到: report.json`));
  }
}

program
  .requiredOption('--url <url>', '起始网址')
  .option('--depth <number>', '最大爬取深度', '5')
  .option('--concurrency <number>', '并发数', '5')
  .option('--sitemap <url>', 'Sitemap URL（可选）')
  .option('--extra-urls <file>', '额外URL列表文件（每行一个URL，可选）');

program.parse();

const options = program.opts();
const crawler = new FourOhFourCrawler(
  options.url,
  parseInt(options.depth, 10),
  parseInt(options.concurrency, 10),
  options.sitemap || null,
  options.extraUrls || null
);

crawler.start().catch(error => {
  console.error(chalk.red(`❌ 错误: ${error.message}`));
  process.exit(1);
});
