#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';

const program = new Command();

program
  .name('article-extract')
  .description('批量提取文章正文 - Extract article content from multiple URLs')
  .version('1.0.0')
  .option('-i, --input <file>', 'input file with one URL per line')
  .option('-o, --output <dir>', 'output directory for extracted text files', './extracted')
  .option('-u, --url <url>', 'single URL to extract')
  .addHelpText('after', `
Examples:
  $ article-extract add                    # Interactive prompt
  $ article-extract --url https://example.com/article
  $ article-extract --input urls.txt --output ./articles
  $ npx article-extract-cli --url https://example.com/article
  `);

program.parse();

const options = program.opts();

// Clean filename for filesystem
function cleanFilename(title) {
  let filename = title
    .replace(/[\/:*?""<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  filename = filename.substring(0, Math.min(80, filename.length));
  return filename + '.txt';
}

// Extract article content from HTML
function extractArticle(html, url) {
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();
  
  if (!article) {
    return null;
  }
  
  // Convert HTML to plain text
  const tempDiv = dom.window.document.createElement('div');
  tempDiv.innerHTML = article.content;
  
  // Remove unwanted elements
  const unwanted = tempDiv.querySelectorAll('script, style, nav, header, footer, aside, form, iframe, .ad, .ads, .advertisement, .sidebar, .related, .comments');
  unwanted.forEach(el => el.remove());
  
  let text = tempDiv.textContent || tempDiv.innerText || '';
  text = text.replace(/\s+/g, ' ').trim();
  text = text.replace(/\n\s*\n/g, '\n\n');
  
  return {
    title: article.title,
    content: text,
    byline: article.byline
  };
}

// Extract and save single article
async function extractAndSave(url, outputDir) {
  console.log(chalk.blue(`📥 Extracting: ${url}`));
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.log(chalk.red(`❌ HTTP error ${response.status}: ${url}`));
      return false;
    }
    const html = await response.text();
    const article = extractArticle(html, url);
    
    if (!article) {
      console.log(chalk.red(`❌ Failed to extract content: ${url}`));
      return false;
    }
    
    const filename = cleanFilename(article.title);
    const filePath = path.join(outputDir, filename);
    
    // Write file with metadata
    let output = `Title: ${article.title}\n`;
    output += `URL: ${url}\n`;
    if (article.byline) {
      output += `Author: ${article.byline}\n`;
    }
    output += `Extracted: ${new Date().toISOString()}\n`;
    output += '\n---\n\n';
    output += article.content;
    
    fs.writeFileSync(filePath, output, 'utf8');
    
    console.log(chalk.green(`✅ Saved: ${filename} (${article.content.length} chars)`));
    return true;
  } catch (error) {
    console.log(chalk.red(`❌ Error: ${error.message}`));
    return false;
  }
}

// Main function
async function main() {
  // Create output directory
  const outputDir = path.resolve(options.output);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  let urls = [];
  
  if (options.url) {
    urls = [options.url.trim()];
  } else if (options.input) {
    const inputFile = path.resolve(options.input);
    if (!fs.existsSync(inputFile)) {
      console.log(chalk.red(`❌ Input file not found: ${inputFile}`));
      process.exit(1);
    }
    const content = fs.readFileSync(inputFile, 'utf8');
    urls = content.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0 && !line.startsWith('#'));
  } else {
    console.log(chalk.yellow('ℹ️  Please provide either --url or --input option'));
    console.log(chalk.yellow('ℹ️  Run with --help for usage examples'));
    process.exit(1);
  }
  
  if (urls.length === 0) {
    console.log(chalk.red('❌ No URLs provided'));
    process.exit(1);
  }
  
  console.log(chalk.cyan(`🚀 Starting extraction of ${urls.length} URL(s)...`));
  console.log(chalk.cyan(`📂 Output directory: ${outputDir}`));
  console.log();
  
  let success = 0;
  let failed = 0;
  
  for (const url of urls) {
    const result = await extractAndSave(url, outputDir);
    if (result) {
      success++;
    } else {
      failed++;
    }
    console.log();
  }
  
  console.log(chalk.bold.cyan('📊 Extraction Complete'));
  console.log(chalk.green(`✅ Success: ${success}`));
  console.log(chalk.red(`❌ Failed: ${failed}`));
  console.log(chalk.cyan(`📂 Output saved to: ${outputDir}`));
}

main().catch(error => {
  console.error(chalk.red(`💥 Fatal error: ${error.message}`));
  process.exit(1);
});
