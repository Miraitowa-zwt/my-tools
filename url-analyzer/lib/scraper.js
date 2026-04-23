const { chromium } = require('playwright');
const cheerio = require('cheerio');

async function analyzeUrl(sourceUrl, targetUrls) {
  const browser = await chromium.launch({
    headless: true,
  });
  
  const context = await browser.newContext({
    bypassCSP: true,
  });
  
  const page = await context.newPage();

  // Block unnecessary resources to optimize performance
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
    // Navigate to source URL
    const response = await page.goto(sourceUrl, {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    // Wait extra time for JavaScript to render dynamic content
    await page.waitForTimeout(3000);

    // Get page content after JS rendering
    const html = await page.content();
    const $ = cheerio.load(html);

    // Results array
    const results = [];

    // Process each target URL
    for (const targetUrl of targetUrls) {
      const matchingAnchors = [];

      // Normalize URLs for matching - remove protocol, www, trailing sloshes
      const normalizeUrl = (url) => {
        return url
          .toLowerCase()
          .replace(/^https?:\/\//, '')
          .replace(/^www\./, '')
          .replace(/\/$/, '');
      };

      const normalizedTarget = normalizeUrl(targetUrl);

      // Find all anchor tags that match the target URL
      $('a').each((index, element) => {
        // Check common href attributes where URL might be stored
        let href = 
          $(element).attr('href') || 
          $(element).attr('data-href') || 
          $(element).attr('data-url') || 
          $(element).attr('url') ||
          $(element).attr('onclick') || '';
        
        // Extract URL from onclick if it contains window.location
        if (href.includes('location') || href.includes('href')) {
          const urlMatch = href.match(/https?:\/\/[^\s'\"]+/);
          if (urlMatch) {
            href = urlMatch[0];
          }
        }

        if (!href || href === '#' || href === 'javascript:void(0)') return;

        // If href is relative path, resolve it against source URL origin
        try {
          if (href.startsWith('/')) {
            const urlObj = new URL(sourceUrl);
            href = urlObj.origin + href;
          } else if (!href.startsWith('http')) {
            // Relative to current path
            const urlObj = new URL(sourceUrl);
            const basePath = urlObj.origin + urlObj.pathname;
            href = new URL(href, basePath).href;
          }
        } catch (e) {
          // Ignore if parsing fails
        }

        const normalizedHref = normalizeUrl(href);

        // Check multiple matching strategies
        const matched = 
          href === targetUrl || 
          normalizedHref === normalizedTarget ||
          normalizedHref.includes(normalizedTarget) || 
          href.includes(targetUrl);

        if (matched) {
          matchingAnchors.push(element);
        }
      });

      if (matchingAnchors.length === 0) {
        results.push({
          sourceUrl,
          targetUrl,
          found: false,
          anchorText: null,
          anchorType: null,
          finalUrl: null,
          statusCode: null,
          redirectCount: 0,
          hasRedirect: false,
        });
        continue;
      }

      // Process each matching anchor to get anchor text/type
      const anchorData = matchingAnchors.map(anchor => {
        const hasImage = $(anchor).find('img').length > 0;
        const text = $(anchor).text().trim();
        let altText = '';
        
        if (hasImage) {
          altText = $(anchor).find('img').first().attr('alt') || '';
        }

        let type;
        if (hasImage && text) {
          type = 'mixed';
        } else if (hasImage) {
          type = 'image';
        } else {
          type = 'text';
        }

        const extractedText = hasImage ? altText : text;
        return {
          text: extractedText || text,
          type,
        };
      });

      // Check redirect and status code
      let redirectInfo = await checkRedirect(targetUrl);

      results.push({
        sourceUrl,
        targetUrl,
        found: true,
        matches: matchingAnchors.length,
        anchorData,
        finalUrl: redirectInfo.finalUrl,
        statusCode: redirectInfo.statusCode,
        redirectCount: redirectInfo.redirectCount,
        hasRedirect: redirectInfo.hasRedirect,
      });
    }

    return results;

  } catch (error) {
    throw error;
  } finally {
    await browser.close();
  }
}

async function checkRedirect(url) {
  let currentUrl = url;
  let redirectCount = 0;
  let statusCode = 200;
  const maxRedirects = 10;

  try {
    const response = await fetch(currentUrl, {
      method: 'HEAD',
      redirect: 'manual',
    });

    statusCode = response.status;

    if (response.status === 301 || response.status === 302) {
      let location = response.headers.get('location');
      
      while (location && redirectCount < maxRedirects) {
        redirectCount++;
        currentUrl = new URL(location, url).href;
        const redirectResponse = await fetch(currentUrl, {
          method: 'HEAD',
          redirect: 'manual',
        });
        
        statusCode = redirectResponse.status;
        location = redirectResponse.headers.get('location');
      }
    }

    return {
      finalUrl: currentUrl,
      statusCode,
      redirectCount,
      hasRedirect: redirectCount > 0,
    };
  } catch (error) {
    return {
      finalUrl: null,
      statusCode: null,
      redirectCount: 0,
      hasRedirect: false,
      error: error.message,
    };
  }
}

module.exports = {
  analyzeUrl,
};
