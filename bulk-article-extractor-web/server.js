import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// Extract article from URL
app.post('/extract', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    console.log(`Extracting: ${url}`);
    
    const response = await fetch(url);
    if (!response.ok) {
      return res.status(response.status).json({ 
        error: `HTTP error: ${response.status}` 
      });
    }
    
    const html = await response.text();
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();
    
    if (!article) {
      return res.status(422).json({ 
        error: 'Failed to extract article content' 
      });
    }
    
    // Convert to plain text
    const tempDiv = dom.window.document.createElement('div');
    tempDiv.innerHTML = article.content;
    
    // Remove unwanted elements
    const unwanted = tempDiv.querySelectorAll('script, style, nav, header, footer, aside, form, iframe, .ad, .ads, .advertisement, .sidebar, .related, .comments');
    unwanted.forEach(el => el.remove());
    
    let text = tempDiv.textContent || tempDiv.innerText || '';
    text = text.replace(/\s+/g, ' ').trim();
    text = text.replace(/\n\s*\n/g, '\n\n');
    
    res.json({
      title: article.title,
      content: text,
      byline: article.byline,
      length: text.length
    });
    
    console.log(`✓ Extracted: ${article.title} (${text.length} chars)`);
    
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Generate SEO meta from article content
app.post('/generate-seo', async (req, res) => {
  try {
    const { title, content } = req.body;
    
    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }

    console.log(`Generating SEO for: ${title}`);
    
    // The SEO generation happens via AI prompt in frontend
    // This endpoint just confirms ready, actual generation is done by AI
    res.json({
      status: 'ready',
    });
    
  } catch (error) {
    console.error(`❌ SEO generation error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Export as CSV/Excel download
app.post('/download-csv', async (req, res) => {
  try {
    const { data } = req.body;
    // Generate CSV that can be opened in Excel
    let csv = 'Original Title,URL,SEO Title,Title Length,Meta Description,Description Length,URL Slug,Keywords,Tags,Title (Chinese),Description (Chinese)\r\n';
    
    data.forEach(article => {
      if (article.seo) {
        article.seo.titles.forEach((t, i) => {
          const row = [
            escapeCsv(article.originalTitle || ''),
            escapeCsv(article.url || ''),
            escapeCsv(t.text),
            t.length,
            escapeCsv(article.seo.descriptions[i].text),
            article.seo.descriptions[i].length,
            escapeCsv(article.seo.slugs[i]),
            escapeCsv(article.seo.keywords.join(', ')),
            escapeCsv(article.seo.tags.join(', ')),
            escapeCsv(t.zh),
            escapeCsv(article.seo.descriptions[i].zh)
          ];
          csv += row.join(',') + '\r\n';
        });
      } else {
        const row = [
          escapeCsv(article.originalTitle || ''),
          escapeCsv(article.url || ''),
          '', '', '', '', '', '', '', '', ''
        ];
        csv += row.join(',') + '\r\n';
      }
    });
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="seo-meta.csv"');
    res.send(csv);
    
  } catch (error) {
    console.error(`❌ Download error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

function escapeCsv(text) {
  if (typeof text !== 'string') text = String(text);
  return '"' + text.replace(/"/g, '""') + '"';
}

app.listen(PORT, () => {
  console.log(`🚀 Bulk Article Extractor + SEO running at http://localhost:${PORT}`);
  console.log(`📝 Open http://localhost:${PORT} in your browser`);
});
