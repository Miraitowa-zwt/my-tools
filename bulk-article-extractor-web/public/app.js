const API_BASE = window.location.origin;
let extractedArticles = [];

async function extractArticles() {
    const urlsInput = document.getElementById('urlsInput').value.trim();
    const statusDiv = document.getElementById('status');
    const resultsSection = document.getElementById('resultsSection');
    const extractBtn = document.getElementById('extractBtn');
    const downloadBtn = document.getElementById('downloadCSV');

    if (!urlsInput) {
        showStatus('请输入至少一个 URL', 'error');
        return;
    }

    // Split by newline OR space if user puts all in one line
    let urls = [];
    // First split by any whitespace (including newlines and spaces)
    const allTokens = urlsInput.split(/[\s\n]+/)
        .map(token => token.trim())
        .filter(token => token.length > 0);
    urls = allTokens;

    extractBtn.disabled = true;
    downloadBtn.disabled = true;
    showStatus('正在提取 ' + urls.length + ' 篇文章...', 'loading');
    resultsSection.innerHTML = '';
    extractedArticles = [];

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        const loadingId = 'loading-' + i;
        const loadingDiv = document.createElement('div');
        loadingId.id = loadingId;
        loadingDiv.className = 'loading-item';
        loadingDiv.innerHTML = '⏳ 正在提取: ' + escapeHtml(url);
        resultsSection.appendChild(loadingDiv);

        try {
            const result = await extractArticle(url);
            removeElement(loadingId);
            const articleData = {
                url: url,
                originalTitle: result.title,
                content: result.content,
                byline: result.byline,
                seo: null
            };
            extractedArticles.push(articleData);
            displayExtractedArticle(articleData, extractedArticles.length - 1);
            successCount++;
            showStatus('已完成 ' + (i + 1) + '/' + urls.length + ' (成功 ' + successCount + ' 失败 ' + failCount + ')', 'success');
        } catch (error) {
            removeElement(loadingId);
            displayExtractedError(url, error.message);
            failCount++;
            showStatus('第 ' + (i + 1) + ' 篇提取失败: ' + error.message, 'error');
        }
        await new Promise(resolve => setTimeout(resolve, 300));
    }

    extractBtn.disabled = false;
    if (successCount > 0) {
        downloadBtn.disabled = false;
    }

    if (failCount === 0) {
        showStatus('全部完成！成功提取 ' + successCount + ' 篇文章', 'success');
    } else {
        showStatus('完成！成功 ' + successCount + ' 失败 ' + failCount, successCount > 0 ? 'success' : 'error');
    }
}

async function extractArticle(url) {
    const response = await fetch(API_BASE + '/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Extraction failed');
    }

    return await response.json();
}

function displayExtractedArticle(articleData, index) {
    const resultsSection = document.getElementById('resultsSection');
    const itemDiv = document.createElement('div');
    itemDiv.className = 'result-article';

    itemDiv.innerHTML = '\
        <div class=\"result-header\">\
            <div class=\"result-info\">\
                <h3>' + escapeHtml(articleData.originalTitle) + '</h3>\
                <div class=\"result-url\">' + escapeHtml(articleData.url) + '</div>\
                <div class=\"result-meta\">' + articleData.content.length + ' 字符</div>\
            </div>\
            <button class=\"copy-btn\" onclick=\"copyContent(this, ' + index + ')\">复制全文</button>\
        </div>\
        <div class=\"content-container\">\
            <div class=\"content-label\">文章正文</div>\
            <div class=\"result-content\">\
                <textarea readonly>' + escapeHtml(articleData.content) + '</textarea>\
            </div>\
        </div>\
        <div class=\"seo-section\">\
            <div class=\"result-header\" style=\"margin-bottom: 0;\">\
                <div class=\"result-info\">\
                    <div class=\"panel-title\">SEO 元数据</div>\
                    <div class=\"panel-subtitle\">生成 3 组候选 title/description，可导出 CSV</div>\
                </div>\
                    <button class=\"btn-primary generate-seo-btn\" onclick=\"generateSEO(' + index + ')\">生成 SEO ✨</button>\
                </div>\
                <div id=\"seo-content-' + index + '\"></div>\
            </div>\
        ';

    resultsSection.appendChild(itemDiv);
}

function displayExtractedError(url, errorMsg) {
    const resultsSection = document.getElementById('resultsSection');
    const itemDiv = document.createElement('div');
    itemDiv.className = 'result-article';
    itemDiv.style.borderLeft = '4px solid var(--error-red)';
    itemDiv.innerHTML = '\
        <div class=\"result-header\">\
            <div class=\"result-info\">\
                <div class=\"result-title\">❌ 提取失败</div>\
                <div class=\"result-url\">' + escapeHtml(url) + '</div>\
                <div class=\"result-meta\">错误: ' + escapeHtml(errorMsg) + '</div>\
            </div>\
        </div>\
    ';
    resultsSection.appendChild(itemDiv);
}

function copyContent(button, index) {
    const content = extractedArticles[index].content;
    navigator.clipboard.writeText(content).then(() => {
        const originalText = button.textContent;
        button.textContent = '已复制 ✓';
        button.classList.add('copied');

        setTimeout(() => {
            button.textContent = originalText;
            button.classList.remove('copied');
        }, 2000);
    }).catch(err => {
        alert('复制失败，请手动复制');
    });
}

function generateSEO(index) {
    const article = extractedArticles[index];
    const seoContainer = document.getElementById('seo-content-' + index);
    const button = event.target;
    button.disabled = true;
    button.textContent = '复制提示...';

    const prompt = 
`# 任务：为博客文章生成SEO元数据

你是SEO专家，我是一名SEO博主，请严格按照以下要求为这篇博客生成SEO元数据：

---

## 1. SEO 标题 (Title)
- ✅ **严格限制：最多 60 个字符**（包含空格）
- ✅ 吸引人，点击欲望强，准确反映核心内容和价值主张
- ✅ **不包含品牌名称**
- ✅ 英文输出
- ✅ 必须标注字符数：\`标题文字 (XX chars)\`

## 2. SEO 描述 (Meta Description)
- ✅ **严格限制：最多 160 个字符**（包含空格）
- ✅ 开篇要有吸引力，用词鼓励点击
- ✅ 包含主关键词+次要关键词
- ✅ 突出文章独特卖点
- ✅ **规则检查：**
  - 如果标题是**问题** → 描述**必须直接给出明确回答**
  - 如果标题有**数字** → 描述**必须直接列出要点**
  - 如果标题是**陈述** → 描述**扩展支持这个陈述**
- ✅ **禁止以下列词开头：** 
  Transform, Discover, Explore, Learn, Experience, Find, Enjoy, Elevate, Dive, Unravel, Unlock, Upgrade, Effort, Enhance, Uncover, Delve, Unleash, elevate, Discover, Dive, Intricacies, Complex, Multifaceted, Tapestry, Rich, Fabric, Delicate Dance, Interplay, Unfold, Unravel, Insightful, Vibrant, Moreover, Unlock, Browse, Transform, Revamp, Explore, Join, Get
- ✅ 必须标注字符数：\`描述文字 (XX chars)\`

## 3. URL 句柄 (Slug)
- ✅ **最多 7 个单词**
- ✅ 用连字符 \`-\` 分隔
- ✅ 包含核心关键词

## 4. 关键词 & 标签
- ✅ **10 个关键词**（全小写，逗号分隔）
- ✅ **10 个标签**（每个首字母大写，空格分隔，不要 #）

## 5. 中文对照
- SEO 标题和描述都是英文，但需要在每个后面加上中文翻译对照

---

## 输出格式要求

请给出 **3 组候选方案**，格式如下：

\`\`\`
=== 候选 1 ===
【标题】 Your Title Here (XX chars)
【中文】 你的中文翻译
【描述】 Your description here that is under 160 chars (XX chars)
【中文】 你的中文翻译
【Slug】 your-url-slug

=== 候选 2 ===
【标题】 Your Title Here (XX chars)
【中文】 你的中文翻译
【描述】 Your description here that is under 160 chars (XX chars)
【中文】 你的中文翻译
【Slug】 your-url-slug

=== 候选 3 ===
【标题】 Your Title Here (XX chars)
【中文】 你的中文翻译
【描述】 Your description here that is under 160 chars (XX chars)
【中文】 你的中文翻译
【Slug】 your-url-slug

---

## 关键词
keyword1, keyword2, keyword3, keyword4, keyword5, keyword6, keyword7, keyword8, keyword9, keyword10

## 标签
Keyword1 Keyword2 Keyword3 Keyword4 Keyword5 Keyword6 Keyword7 Keyword8 Keyword9 Keyword10
\`\`\`

---

## 文章内容：

${article.content.substring(0, 3000)}
`;

    const seoHtml = '\
        <div style=\"background: var(--bg-elevation); border: 1px solid var(--border-default); border-radius: 6px; padding: 16px; margin-bottom: 16px;\">\
            <p style=\"color: var(--text-secondary); font-size: 14px; margin-bottom: 8px;\"><strong>请将下面的提示复制给 AI 生成 SEO：</strong></p>\
            <textarea readonly style=\"width: 100%; min-height: 300px; background: var(--bg-page); color: var(--text-secondary); border: 1px solid var(--border-subtle); border-radius: 4px; padding: 12px; font-size: 13px;\">' + escapeHtml(prompt) + '</textarea>\
            <button class=\"copy-btn\" style=\"margin-top: 8px;\" onclick=\"copyPrompt(this)\">复制提示</button>\
        </div>\
        <div id=\"seo-result-' + index + '\">\
            <div style=\"background: var(--bg-elevation); border: 1px solid var(--border-default); border-radius: 6px; padding: 16px;\">\
                <p style=\"color: var(--text-secondary); font-size: 14px; margin-bottom: 8px;\"><strong>📋 AI 生成后，粘贴完整结果到下方文本框，点击解析：</strong></p>\
                <textarea id=\"seo-input-' + index + '\" placeholder=\"=== 候选 1 ===\n【标题】 Hard Water vs Soft Water for Locs (42 chars)\n【中文】 硬水对比软水对脏辫的影响\n【描述】 Learn the differences between hard water and soft water for loc maintenance and how it affects your dreadlocks over time. (132 chars)\n【中文】 了解硬水和软水在脏辫护理中的区别，以及它如何长期影响你的脏辫\n【Slug】 hard-water-vs-soft-water-locs\n\n=== 候选 2 ===\n...\n\n关键词\n...\n\n标签\n...\" style=\"width: 100%; min-height: 400px; background: var(--bg-page); color: var(--text-secondary); border: 1px solid var(--border-subtle); border-radius: 4px; padding: 12px; font-size: 13px;\"></textarea>\
                <button class=\"btn-primary generate-seo-btn\" onclick=\"parseSEO(' + index + ')\">✅ 解析 SEO 结果</button>\n            </div>\n        </div>\
    ';


    seoContainer.innerHTML = seoHtml;
    button.disabled = false;
    button.textContent = '重新生成';
}

function copyPrompt(button) {
    const textarea = button.previousElementSibling.querySelector('textarea');
    navigator.clipboard.writeText(textarea.value).then(() => {
        const originalText = button.textContent;
        button.textContent = '已复制 ✓';
        button.classList.add('copied');
        setTimeout(() => {
            button.textContent = '复制提示';
            button.classList.remove('copied');
        }, 2000);
    });
}

function displaySEO(index, seoData) {
    const container = document.getElementById('seo-result-' + index);
    let html = '';

    html += '<div class=\"seo-cards\">';
    seoData.titles.forEach((t, i) => {
        html += '\
            <div class=\"seo-card\">\
                <div class=\"seo-card-title\">候选 ' + (i + 1) + '</div>\
                <div class=\"seo-item\">\
                    <div class=\"seo-item-label\">SEO Title (' + t.length + ' chars)</div>\
                    <div class=\"seo-item-value\">' + escapeHtml(t.text) + '</div>\
                    <div class=\"seo-item-value-zh\">' + escapeHtml(t.zh) + '</div>\
                </div>\
                <div class=\"seo-item\">\
                    <div class=\"seo-item-label\">Meta Description (' + seoData.descriptions[i].length + ' chars)</div>\
                    <div class=\"seo-item-value\">' + escapeHtml(seoData.descriptions[i].text) + '</div>\
                    <div class=\"seo-item-value-zh\">' + escapeHtml(seoData.descriptions[i].zh) + '</div>\
                </div>\
                <div class=\"seo-item\">\
                    <div class=\"seo-item-label\">URL Slug</div>\
                    <div class=\"seo-item-value\">' + escapeHtml(seoData.slugs[i]) + '</div>\n\
                </div>\
            </div>\
        ';
    });
    html += '</div>';

    html += '\
        <div class=\"seo-meta-row\">\
            <div class=\"seo-keywords\">\
                <div class=\"seo-item-label\">10 Keywords</div>\
                <div style=\"margin-top: 8px;\">\n';
    seoData.keywords.forEach(k => {
        html += '<span class=\"tag\">' + escapeHtml(k) + '</span>';
    });
    html += '</div></div>';

    html += '\
            <div class=\"seo-tags\">\
                <div class=\"seo-item-label\">10 Tags</div>\
                <div style=\"margin-top: 8px;\">\n';
    seoData.tags.forEach(t => {
        html += '<span class=\"tag\">' + escapeHtml(t) + '</span>';
    });
    html += '</div></div></div>';

        container.innerHTML = html;

    // Save to article data
    extractedArticles[index].seo = seoData;
}

function parseSEO(index) {
    const inputText = document.getElementById('seo-input-' + index).value;
    if (!inputText.trim()) {
        alert('请先粘贴 AI 生成的结果');
        return;
    }

    try {
        const result = parseAIResult(inputText);
        displaySEO(index, result);
    } catch (e) {
        alert('解析失败：' + e.message + '\\n\\n请检查格式，格式应该是：\\n=== 候选 1 ===\\n【标题】... (XX chars)\\n【中文】...\\n【描述】... (XX chars)\\n【中文】...\\n【Slug】...');
    }
}

function parseAIResult(text) {
    // Split into candidates
    const candidateBlocks = text.split(/===[\s]*候选[\s]*(\d+)[\s]*===/i);
    // Remove empty first block
    candidateBlocks.shift();

    const candidates = [];
    for (let i = 0; i < candidateBlocks.length; i += 2) {
        const block = candidateBlocks[i + 1];
        if (!block) continue;

        const titleMatch = block.match(/【标题】([^(\n]*)\\s*\((\d+)\s*chars\)/);
        const descMatch = block.match(/【描述】([^(\n]*)\\s*\((\d+)\s*chars\)/);
        const chineseTitleMatch = block.match(/【中文】([^\n]*/);
        const chineseDescMatch = block.match(/【中文】([^\n]*\n.*【Slug】/);
        const slugMatch = block.match(/【Slug】([^\n]*)/);

        if (!titleMatch || !descMatch) {
            throw new Error('找不到标题或描述，检查格式');
        }

        candidates.push({
            title: {
            text: titleMatch[1].trim(),
            length: parseInt(titleMatch[2]),
            zh: chineseTitleMatch ? chineseTitleMatch[1].replace('【中文】', '').trim() : ''
        },
        description: {
            text: descMatch[1].trim(),
            length: parseInt(descMatch[2]),
            zh: chineseDescMatch ? chineseDescMatch[1].replace('【中文】', '').trim().replace(/【Slug】.*$', '') : ''
        },
        slug: slugMatch ? slugMatch[1].trim() : ''
        });
    }

    // Parse keywords and tags
    let keywords = [];
    let tags = [];

    const keywordsMatch = text.match(/关键词\s*([\s\S]*?\n\s*');
    if (keywordsMatch) {
        keywords = keywordsMatch[1].trim().split(',').map(s => s.trim()).filter(s => s.length);
    }

    const tagsMatch = text.match(/标签\s*([\s\S]*$/);
    if (tagsMatch) {
        tags = tagsMatch[1].trim().split(/\s+/).map(s => s.trim()).filter(s => s.length);
    }

    return {
        titles: candidates.map(c => c.title),
        descriptions: candidates.map(c => c.description),
        slugs: candidates.map(c => c.slug),
        keywords: keywords,
        tags: tags
    };
}

function downloadCSV() {
    let csv = 'Original Title,URL,SEO Title,Title Length,Meta Description,Description Length,URL Slug,Keywords,Tags,Title (Chinese),Description (Chinese)\\n';
    extractedArticles.forEach(article => {
        if (article.seo) {
            article.seo.titles.forEach((t, i) => {
                csv += escapeCSV(article.originalTitle) + ',' +
                    escapeCSV(article.url) + ',' +
                    escapeCSV(t.text) + ',' +
                    t.length + ',' +
                    escapeCSV(article.seo.descriptions[i].text) + ',' +
                    article.seo.descriptions[i].length + ',' +
                    escapeCSV(article.seo.slugs[i]) + ',' +
                    escapeCSV(article.seo.keywords.join(', ')) + ',' +
                    escapeCSV(article.seo.tags.join(', ')) + ',' +
                    escapeCSV(t.zh) + ',' +
                    escapeCSV(article.seo.descriptions[i].zh) + '\\n';
            });
        } else {
            csv += escapeCSV(article.originalTitle) + ',' +
                escapeCSV(article.url) +
                ',,,,,,,\\n';
        }
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'seo-meta.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
}

function escapeCSV(text) {
    if (typeof text !== 'string') text = String(text);
    return '"' + text.replace(/"/g, '""') + '"';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function removeElement(id) {
    const elem = document.getElementById(id);
    if (elem) elem.remove();
}

function clearAllResults() {
    document.getElementById('resultsSection').innerHTML = '';
    document.getElementById('status').style.display = 'none';
    document.getElementById('downloadCSV').disabled = true;
    extractedArticles = [];
}

function showStatus(message, type) {
    const statusDiv = document.getElementById('status');
    statusDiv.className = 'status ' + type;
    statusDiv.textContent = message;
}
