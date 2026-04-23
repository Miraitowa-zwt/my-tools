const FullSiteCrawler = require('../lib/site-crawler');

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log('Usage: node scripts/full-site-crawler.js <start-url> <output-file>');
    console.log('Example: node scripts/full-site-crawler.js https://example.com output.xlsx');
    process.exit(1);
  }

  const startUrl = args[0];
  const outputFile = args[1];
  const concurrency = parseInt(process.env.CRAWL_CONCURRENCY || '4');

  try {
    const crawler = new FullSiteCrawler(startUrl, concurrency);
    await crawler.init();
    await crawler.startCrawl();
    await crawler.exportToExcel(outputFile);
    console.log('\nDone!');
    process.exit(0);
  } catch (error) {
    console.error('Crawl failed:', error);
    process.exit(1);
  }
}

main();
