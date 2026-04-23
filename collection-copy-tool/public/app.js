/* ═══════════════════════════════════════════════════════
   集合页文案工具 — 前端逻辑
   ═══════════════════════════════════════════════════════ */

// ─── 状态管理 ─────────────────────────────────────────
const state = {
  mode: 'prompt',           // 'prompt' | 'api'
  scrapedData: null,        // 后端抓取结果
  manualOverrides: {},      // 手动补充内容
  failedUrls: [],           // 抓取失败的 URL 队列
  currentFailedIndex: 0,    // 当前处理的失败 URL 索引
  generatedContent: '',     // AI 生成的完整内容
  keywordsPool: [],         // 当前关键词总表（未保存状态）
  currentDomain: '',        // 当前操作的域名
};

// ─── DOM 引用 ─────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const $$ = (sel) => document.querySelectorAll(sel);

// ─── 初始化 ───────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initModeToggle();
  initTabs();
  initForm();
  initKeywordsDrawer();
  initHistoryPanel();
  initCopyButtons();
  initToast();
});

// ─── 模式切换 ─────────────────────────────────────────
function initModeToggle() {
  $$('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.mode = btn.dataset.mode;
      updateStatusBar(`已切换至 ${state.mode === 'prompt' ? 'Prompt 模式' : 'API 模式'}`, 'ready');
    });
  });
}

// ─── Tab 切换 ─────────────────────────────────────────
function initTabs() {
  $$('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.tab-btn').forEach(b => b.classList.remove('active'));
      $$('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      $(`tab-${btn.dataset.tab}`).classList.add('active');
    });
  });
}

// ─── 表单逻辑 ─────────────────────────────────────────
function initForm() {
  // 关键词计数
  $('keywords').addEventListener('input', updateKeywordCount);

  // 生成按钮
  $('btnGenerate').addEventListener('click', handleGenerate);

  // 清空表单
  $('btnClearForm').addEventListener('click', () => {
    if (confirm('确定清空所有输入内容？')) {
      $('mainForm').reset();
      updateKeywordCount();
    }
  });

  // 保存至历史
  $('btnSaveHistory').addEventListener('click', handleSaveHistory);

  // website_url 失焦时提取域名
  $('website_url').addEventListener('blur', () => {
    const url = $('website_url').value.trim();
    if (url) {
      try {
        state.currentDomain = new URL(url).hostname;
        loadHistoryForDomain(state.currentDomain);
      } catch (e) {}
    }
  });

  // 语言切换联动
  const langSelect = $('output_language');
  if (langSelect) {
    langSelect.addEventListener('change', () => {
      const val = langSelect.value;
      const customField = $('customLanguageField');
      if (val === 'custom') {
        customField.classList.remove('hidden');
      } else {
        customField.classList.add('hidden');
        updateLangTab(val);
      }
    });
  }

  const customLangInput = $('custom_language');
  if (customLangInput) {
    customLangInput.addEventListener('input', () => {
      updateLangTab(customLangInput.value.trim() || '自定义语言');
    });
  }
}
  
  // 更新产品链接显示（已废弃，产品链接改为手动输入）
  function updateProductLinks(scrapedData) {
    // 此函数已不再使用，产品链接改为手动输入
  }

  

function updateKeywordCount() {
  const val = $('keywords').value.trim();
  const count = val ? val.split(',').filter(k => k.trim()).length : 0;
  $('keywordCount').textContent = `已输入 ${count} 个关键词 ${count < 5 ? '（建议 5–10 个）' : count > 10 ? '（已超出建议数量）' : '✓'}`;
  $('keywordCount').style.color = count > 10 ? 'var(--warning)' : 'var(--text-secondary)';
}

function getFormValues() {
  return {
    brand_name: $('brand_name').value.trim(),
    website_url: $('website_url').value.trim(),
    collection_url: $('collection_url').value.trim(),
    collection_topic: $('collection_topic').value.trim(),
    target_market: $('target_market').value.trim(),
    keywords: $('keywords').value.trim(),
    competitor_urls: $('competitor_urls').value.trim()
      .split('\n').map(u => u.trim()).filter(Boolean),
    product_links: $('product_links').value.trim()
      .split('\n').map(u => u.trim()).filter(Boolean),
    brand_info: $('brand_info').value.trim(),
    output_language: getSelectedLanguage(),
  };
}

// 获取当前选择的输出语言
function getSelectedLanguage() {
  const select = $('output_language');
  if (!select) return 'English';
  if (select.value === 'custom') {
    return $('custom_language').value.trim() || 'English';
  }
  return select.value;
}

// 语言对应的 emoji 旗帜
function getLangEmoji(lang) {
  const map = {
    'English': '🇺🇸',
    'Spanish': '🇪🇸',
    'French': '🇫🇷',
    'German': '🇩🇪',
    'Italian': '🇮🇹',
    'Portuguese': '🇵🇹',
    'Japanese': '🇯🇵',
    'Korean': '🇰🇷',
    'Arabic': '🇸🇦',
    'Dutch': '🇳🇱',
    'Russian': '🇷🇺',
  };
  return map[lang] || '🌐';
}

// 更新 Tab 标签文字
function updateLangTab(lang) {
  const btn = $('tabBtnLang');
  if (btn) {
    btn.textContent = `${getLangEmoji(lang)} ${lang} 版`;
  }
  // 更新英文版输出区域的 label
  const label = document.querySelector('#tab-en .output-label');
  if (label) {
    label.textContent = `${lang} 版文案`;
  }
}

function validateForm(values) {
  const required = ['brand_name', 'website_url', 'collection_url', 'collection_topic', 'target_market', 'keywords', 'output_language'];
  let valid = true;

  // 清除旧错误
  $$('.form-field input, .form-field textarea').forEach(el => el.classList.remove('error'));

  required.forEach(field => {
    const el = $(field);
    if (!values[field]) {
      el.classList.add('error');
      valid = false;
    }
  });

  if (!valid) {
    showToast('⚠️ 请填写所有必填字段');
  }
  return valid;
}

// ─── 生成主流程 ───────────────────────────────────────
async function handleGenerate() {
  const values = getFormValues();
  if (!validateForm(values)) return;

  // 显示预检确认弹窗
  showPreflightModal(values);
}

function showPreflightModal(values) {
  const body = $('modalBody');
  const modeLabel = state.mode === 'prompt' ? '📋 Prompt 模式' : '⚡ API 模式';

  body.innerHTML = `
    <div class="preflight-row">
      <div class="preflight-label">品牌名称</div>
      <div class="preflight-value">${escHtml(values.brand_name)}</div>
    </div>
    <div class="preflight-row">
      <div class="preflight-label">品牌官网</div>
      <div class="preflight-value">${escHtml(values.website_url)}</div>
    </div>
    <div class="preflight-row">
      <div class="preflight-label">集合页 URL</div>
      <div class="preflight-value">${escHtml(values.collection_url)}</div>
    </div>
    <div class="preflight-row">
      <div class="preflight-label">集合页主题</div>
      <div class="preflight-value">${escHtml(values.collection_topic)}</div>
    </div>
    <div class="preflight-row">
      <div class="preflight-label">目标市场</div>
      <div class="preflight-value">${escHtml(values.target_market)}</div>
    </div>
    <div class="preflight-row">
      <div class="preflight-label">关键词列表</div>
      <div class="preflight-value">${escHtml(values.keywords)}</div>
    </div>
    <div class="preflight-row">
      <div class="preflight-label">竞品 URL</div>
      <div class="preflight-value">${values.competitor_urls.length ? escHtml(values.competitor_urls.join('\n')) : '<span style="color:var(--text-placeholder)">未填写</span>'}</div>
    </div>
    <div class="preflight-row">
      <div class="preflight-label">产品链接数量</div>
      <div class="preflight-value">${values.product_links.length} 个产品</div>
    </div>
    <div class="preflight-row">
      <div class="preflight-label">输出语言</div>
      <div class="preflight-value">${getLangEmoji(values.output_language)} ${escHtml(values.output_language)}</div>
    </div>
    <div class="preflight-row">
      <div class="preflight-label">输出模式</div>
      <div class="preflight-value"><span class="preflight-mode">${modeLabel}</span></div>
    </div>
  `;

  $('modalConfirm').classList.remove('hidden');

  // 绑定确认按钮（先移除旧监听）
  const confirmBtn = $('btnModalConfirm');
  const newConfirmBtn = confirmBtn.cloneNode(true);
  confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
  newConfirmBtn.addEventListener('click', () => {
    $('modalConfirm').classList.add('hidden');
    startGeneration(values);
  });
}

$('modalClose').addEventListener('click', () => $('modalConfirm').classList.add('hidden'));
$('btnModalCancel').addEventListener('click', () => $('modalConfirm').classList.add('hidden'));

async function startGeneration(values) {
  setGenerateLoading(true);
  clearOutputs();

  if (state.mode === 'api') {
    await runApiMode(values);
  } else {
    await runPromptMode(values);
  }

  setGenerateLoading(false);
}

// ─── Prompt 模式 ──────────────────────────────────────
async function runPromptMode(values) {
  updateStatusBar('正在构建 Prompt...', 'loading');
  try {
    const res = await fetch('/api/build-prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ variables: values, scrapedData: null, manualOverrides: {} }),
    });
    const data = await res.json();
    $('outputPrompt').value = data.prompt;

    // 自动切换到 Prompt Tab
    $$('.tab-btn').forEach(b => b.classList.remove('active'));
    $$('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelector('[data-tab="prompt"]').classList.add('active');
    $('tab-prompt').classList.add('active');

    updateStatusBar('Prompt 已生成，可复制后手动使用', 'success');
    showToast('✅ Prompt 已生成');
  } catch (e) {
    updateStatusBar(`错误：${e.message}`, 'error');
    showToast('❌ Prompt 生成失败');
  }
}

// ─── API 模式 ─────────────────────────────────────────
async function runApiMode(values) {
  // Step 1: 抓取网页（仅抓取品牌官网、集合页、竞品页，不抓取产品详情页）
  updateStatusBar('正在抓取网页内容...', 'loading');
  addScrapeTag('集合页', 'pending');

  let scrapedData = null;
  try {
    const res = await fetch('/api/scrape-collection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        collection_url: values.collection_url,
        website_url: values.website_url,
        competitor_urls: values.competitor_urls,
        skip_products: true, // 跳过产品详情页抓取
      }),
    });
    scrapedData = await res.json();
    state.scrapedData = scrapedData;

    // 更新抓取状态标签
    updateScrapeStatus(scrapedData);

    // 收集失败的 URL
    state.failedUrls = [];
    state.manualOverrides = {};

    if (scrapedData.brand && !scrapedData.brand.success) {
      state.failedUrls.push({ type: 'brand', url: values.website_url });
    }
    if (scrapedData.collection && !scrapedData.collection.success) {
      state.failedUrls.push({ type: 'collection', url: values.collection_url });
    }
    if (scrapedData.competitors) {
      scrapedData.competitors.filter(c => !c.success).forEach(c => {
        state.failedUrls.push({ type: 'competitor', url: c.url });
      });
    }

  } catch (e) {
    updateStatusBar(`抓取请求失败：${e.message}`, 'error');
    showToast('❌ 网页抓取失败');
    return;
  }

  // Step 2: 处理抓取失败的 URL（手动补充流程）
  if (state.failedUrls.length > 0) {
    state.currentFailedIndex = 0;
    await processFailedUrls();
  }

  // Step 3: 调用 Gemini API（流式）
  await callGeminiApi(values);
}
    if (scrapedData.collection && !scrapedData.collection.success) {
      state.failedUrls.push({ type: 'collection', url: values.collection_url });
    }
    if (scrapedData.products) {
      scrapedData.products.filter(p => !p.success).forEach(p => {
        state.failedUrls.push({ type: 'product', url: p.url });
      });
    }
    if (scrapedData.competitors) {
      scrapedData.competitors.filter(c => !c.success).forEach(c => {
        state.failedUrls.push({ type: 'competitor', url: c.url });
      });
    }

  } catch (e) {
    updateStatusBar(`抓取请求失败：${e.message}`, 'error');
    showToast('❌ 网页抓取失败');
    return;
  }

  // Step 2: 处理抓取失败的 URL（手动补充流程）
  if (state.failedUrls.length > 0) {
    state.currentFailedIndex = 0;
    await processFailedUrls();
  }

  // Step 3: 调用 Gemini API（流式）
  await callGeminiApi(values);
}

function updateScrapeStatus(scrapedData) {
  clearScrapeProgress();
  if (scrapedData.brand) addScrapeTag('官网', scrapedData.brand.success ? 'ok' : 'fail');
  if (scrapedData.collection) addScrapeTag('集合页', scrapedData.collection.success ? 'ok' : 'fail');
  if (scrapedData.competitors && scrapedData.competitors.length > 0) {
    const ok = scrapedData.competitors.filter(c => c.success).length;
    addScrapeTag(`竞品页 ${ok}/${scrapedData.competitors.length}`, ok === scrapedData.competitors.length ? 'ok' : 'fail');
  }
}

// 手动补充流程（Promise 链）
function processFailedUrls() {
  return new Promise((resolve) => {
    function processNext() {
      if (state.currentFailedIndex >= state.failedUrls.length) {
        resolve();
        return;
      }
      const item = state.failedUrls[state.currentFailedIndex];
      showManualModal(item.url, (content) => {
        if (content !== null) {
          // 按类型存入 manualOverrides
          if (item.type === 'brand') state.manualOverrides.brand = content;
          else if (item.type === 'collection') state.manualOverrides.collection = content;
          else if (item.type === 'product') {
            if (!state.manualOverrides.products) state.manualOverrides.products = {};
            state.manualOverrides.products[item.url] = content;
          } else if (item.type === 'competitor') {
            if (!state.manualOverrides.competitors) state.manualOverrides.competitors = {};
            state.manualOverrides.competitors[item.url] = content;
          }
        }
        state.currentFailedIndex++;
        processNext();
      });
    }
    processNext();
  });
}

function showManualModal(url, callback) {
  $('manualUrl').textContent = url;
  $('manualContent').value = '';
  $('modalManual').classList.remove('hidden');

  const submitBtn = $('btnManualSubmit');
  const skipBtn = $('btnManualSkip');
  const closeBtn = $('modalManualClose');

  const cleanup = () => {
    $('modalManual').classList.add('hidden');
    submitBtn.replaceWith(submitBtn.cloneNode(true));
    skipBtn.replaceWith(skipBtn.cloneNode(true));
    closeBtn.replaceWith(closeBtn.cloneNode(true));
  };

  $('btnManualSubmit').addEventListener('click', () => {
    const content = $('manualContent').value.trim();
    cleanup();
    callback(content || null);
  });

  $('btnManualSkip').addEventListener('click', () => {
    cleanup();
    callback(null);
  });

  $('modalManualClose').addEventListener('click', () => {
    cleanup();
    callback(null);
  });
}

// 调用 Gemini API（流式 SSE）
async function callGeminiApi(values) {
  updateStatusBar('正在调用 Gemini 2.5 生成文案...', 'loading');

  // 切换到英文 Tab 准备流式展示
  $$('.tab-btn').forEach(b => b.classList.remove('active'));
  $$('.tab-content').forEach(c => c.classList.remove('active'));
  document.querySelector('[data-tab="en"]').classList.add('active');
  $('tab-en').classList.add('active');

  $('outputEnPreview').innerHTML = '<div style="color:var(--text-secondary);padding:20px;">⏳ 正在生成，请稍候...</div>';

  let fullText = '';

  try {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        variables: values,
        scrapedData: state.scrapedData,
        manualOverrides: state.manualOverrides,
      }),
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const parsed = JSON.parse(line.slice(6));
            if (parsed.type === 'chunk') {
              fullText += parsed.text;
              // 实时渲染 Markdown
              $('outputEnPreview').innerHTML = marked.parse(fullText);
            } else if (parsed.type === 'done') {
              state.generatedContent = fullText;
              processGeneratedContent(fullText);
              updateStatusBar('✅ 文案生成完成', 'success');
              showToast('✅ 文案生成完成');
            } else if (parsed.type === 'error') {
              updateStatusBar(`❌ 生成错误：${parsed.message}`, 'error');
              showToast('❌ 生成失败，请检查 API Key');
            }
          } catch (e) { /* 忽略解析错误 */ }
        }
      }
    }
  } catch (e) {
    updateStatusBar(`❌ 请求失败：${e.message}`, 'error');
    showToast('❌ 网络请求失败');
  }
}

// ─── 处理生成内容：拆分英文/中文/HTML ────────────────
function processGeneratedContent(fullText) {
  // 拆分英文版
  const enMatch = fullText.match(/##\s*📝\s*Collection Page Copy[^]*?(?=##\s*📝\s*中文对照版|$)/i);
  const enContent = enMatch ? enMatch[0].trim() : fullText;

  // 拆分中文版
  const zhMatch = fullText.match(/##\s*📝\s*中文对照版[^]*?(?=##\s*📚|##\s*✅|$)/i);
  const zhContent = zhMatch ? zhMatch[0].trim() : '';

  // 英文版渲染
  $('outputEnPreview').innerHTML = marked.parse(enContent);
  $('outputEnRaw').value = enContent;

  // 中文版渲染
  if (zhContent) {
    $('outputZhPreview').innerHTML = marked.parse(zhContent);
    $('outputZhRaw').value = zhContent;
  }

  // 生成 HTML 片段
  const htmlContent = markdownToShopifyHtml(enContent);
  $('outputHtml').textContent = htmlContent;

  // Prompt Tab 也填入（供参考）
  if (!$('outputPrompt').value) {
    fetch('/api/build-prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ variables: getFormValues(), scrapedData: state.scrapedData, manualOverrides: state.manualOverrides }),
    }).then(r => r.json()).then(d => { $('outputPrompt').value = d.prompt; });
  }
}

// ─── Markdown → Shopify HTML 片段 ────────────────────
function markdownToShopifyHtml(markdown) {
  // 使用 marked 生成 HTML，然后清理外壳标签
  let html = marked.parse(markdown);

  // 移除 h1（按规范不应存在，但防御性处理）
  html = html.replace(/<h1[^>]*>.*?<\/h1>/gi, '');

  // 格式化输出
  html = html
    .replace(/<h2>/g, '\n<h2>')
    .replace(/<h3>/g, '\n<h3>')
    .replace(/<\/h2>/g, '</h2>\n')
    .replace(/<\/h3>/g, '</h3>\n')
    .replace(/<\/p>/g, '</p>\n')
    .replace(/<\/ul>/g, '</ul>\n')
    .replace(/<\/ol>/g, '</ol>\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return html;
}

// ─── 关键词总表抽屉 ───────────────────────────────────
function initKeywordsDrawer() {
  $('btnOpenKeywords').addEventListener('click', openDrawer);
  $('drawerClose').addEventListener('click', closeDrawer);
  $('btnDrawerCancel').addEventListener('click', closeDrawer);
  $('drawerOverlay').addEventListener('click', closeDrawer);

  $('btnSelectAll').addEventListener('click', () => {
    $$('#keywordsPoolList input[type="checkbox"]').forEach(cb => {
      cb.checked = true;
      cb.closest('.keyword-pool-item').classList.add('selected');
    });
  });

  $('btnClearSelection').addEventListener('click', () => {
    $$('#keywordsPoolList input[type="checkbox"]').forEach(cb => {
      cb.checked = false;
      cb.closest('.keyword-pool-item').classList.remove('selected');
    });
  });

  $('btnCopyPool').addEventListener('click', () => {
    const all = state.keywordsPool.join(', ');
    copyToClipboard(all, $('btnCopyPool'));
  });

  $('btnAddKeyword').addEventListener('click', addNewKeyword);
  $('newKeywordInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addNewKeyword();
  });

  $('btnAddSelected').addEventListener('click', () => {
    const selected = [];
    $$('#keywordsPoolList input[type="checkbox"]:checked').forEach(cb => {
      selected.push(cb.dataset.keyword);
    });
    if (selected.length === 0) { showToast('⚠️ 请先勾选关键词'); return; }

    const current = $('keywords').value.trim();
    const existing = current ? current.split(',').map(k => k.trim()).filter(Boolean) : [];
    const merged = [...new Set([...existing, ...selected])];
    $('keywords').value = merged.join(', ');
    updateKeywordCount();
    closeDrawer();
    showToast(`✅ 已添加 ${selected.length} 个关键词`);
  });
}

function openDrawer() {
  // 从当前域名历史加载关键词总表
  const domain = state.currentDomain || extractDomain($('website_url').value);
  if (domain) {
    const history = loadHistory();
    const record = history.find(h => h.domain === domain);
    state.keywordsPool = record ? [...(record.keywords_pool || [])] : [];
  }
  renderKeywordsPool();
  $('keywordsDrawer').classList.remove('hidden');
  $('drawerOverlay').classList.remove('hidden');
}

function closeDrawer() {
  // 丢弃未保存的修改
  $('keywordsDrawer').classList.add('hidden');
  $('drawerOverlay').classList.add('hidden');
}

function renderKeywordsPool() {
  const list = $('keywordsPoolList');
  list.innerHTML = '';
  if (state.keywordsPool.length === 0) {
    list.innerHTML = '<div style="color:var(--text-placeholder);font-size:13px;padding:12px 0;">暂无关键词，请在下方添加</div>';
    return;
  }
  state.keywordsPool.forEach((kw, idx) => {
    const item = document.createElement('div');
    item.className = 'keyword-pool-item';
    item.innerHTML = `
      <input type="checkbox" data-keyword="${escAttr(kw)}" data-idx="${idx}" />
      <input type="text" class="kw-text" value="${escAttr(kw)}" data-idx="${idx}" />
      <button class="btn-del-kw" data-idx="${idx}" title="删除">✕</button>
    `;
    // 勾选联动
    item.querySelector('input[type="checkbox"]').addEventListener('change', (e) => {
      item.classList.toggle('selected', e.target.checked);
    });
    // 内联编辑
    item.querySelector('.kw-text').addEventListener('change', (e) => {
      state.keywordsPool[idx] = e.target.value.trim();
    });
    // 删除
    item.querySelector('.btn-del-kw').addEventListener('click', () => {
      state.keywordsPool.splice(idx, 1);
      renderKeywordsPool();
    });
    list.appendChild(item);
  });
}

function addNewKeyword() {
  const input = $('newKeywordInput');
  const val = input.value.trim();
  if (!val) return;

  // 检查是否包含逗号或换行，支持批量添加
  if (val.includes(',') || val.includes('\n')) {
    const keywords = val.split(/[,\n]/)
      .map(k => k.trim())
      .filter(k => k && !state.keywordsPool.includes(k));
    
    if (keywords.length === 0) {
      showToast('⚠️ 没有新的有效关键词');
      return;
    }
    
    state.keywordsPool.push(...keywords);
    input.value = '';
    renderKeywordsPool();
    showToast(`✅ 已添加 ${keywords.length} 个关键词`);
    return;
  }

  // 单个关键词添加
  if (state.keywordsPool.includes(val)) {
    showToast('⚠️ 该关键词已存在');
    return;
  }
  state.keywordsPool.push(val);
  input.value = '';
  renderKeywordsPool();
}

// ─── 历史记录 ─────────────────────────────────────────
function initHistoryPanel() {
  $('btnHistory').addEventListener('click', () => {
    renderHistoryList();
    $('modalHistory').classList.remove('hidden');
  });
  $('modalHistoryClose').addEventListener('click', () => $('modalHistory').classList.add('hidden'));
}

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem('cct_history') || '[]');
  } catch { return []; }
}

function saveHistory(history) {
  localStorage.setItem('cct_history', JSON.stringify(history));
}

function handleSaveHistory() {
  const values = getFormValues();
  const domain = extractDomain(values.website_url);
  if (!domain) { showToast('⚠️ 请先填写品牌官网 URL'); return; }

  const history = loadHistory();
  const existingIdx = history.findIndex(h => h.domain === domain);

  const record = {
    domain,
    brand_name: values.brand_name,
    website_url: values.website_url,
    target_market: values.target_market,
    keywords_pool: state.keywordsPool,
    competitor_urls: values.competitor_urls.join('\n'),
    brand_info: values.brand_info,
    last_updated: new Date().toISOString().split('T')[0],
  };

  if (existingIdx >= 0) {
    if (!confirm(`域名 "${domain}" 已有历史记录，是否覆盖？`)) return;
    history[existingIdx] = record;
  } else {
    history.unshift(record);
  }

  saveHistory(history);
  showToast(`✅ 已保存 ${domain} 的历史记录`);
}

function loadHistoryForDomain(domain) {
  const history = loadHistory();
  const record = history.find(h => h.domain === domain);
  if (!record) return;

  // 填充表单（不覆盖集合页URL/主题/关键词列表）
  if (record.brand_name) $('brand_name').value = record.brand_name;
  if (record.target_market) $('target_market').value = record.target_market;
  if (record.competitor_urls) $('competitor_urls').value = record.competitor_urls;
  if (record.brand_info) $('brand_info').value = record.brand_info;
  state.keywordsPool = record.keywords_pool || [];
  state.currentDomain = domain;

  showToast(`📂 已加载 ${domain} 的历史记录`);
}

function renderHistoryList() {
  const history = loadHistory();
  const list = $('historyList');

  if (history.length === 0) {
    list.innerHTML = '<div class="history-empty">暂无历史记录<br><span style="font-size:12px">填写表单后点击「保存至历史」</span></div>';
    return;
  }

  list.innerHTML = history.map((record, idx) => `
    <div class="history-item" data-idx="${idx}">
      <div class="history-item-left">
        <div class="history-domain">🌐 ${escHtml(record.domain)}</div>
        <div class="history-meta">
          <span>🏷 ${escHtml(record.brand_name || '—')}</span>
          <span>🌍 ${escHtml(record.target_market || '—')}</span>
          <span>📅 ${record.last_updated || '—'}</span>
          <span>🔑 ${(record.keywords_pool || []).length} 个关键词</span>
        </div>
      </div>
      <div class="history-item-actions">
        <button class="btn-ghost btn-sm btn-load-history" data-idx="${idx}">加载</button>
        <button class="btn-danger btn-sm btn-del-history" data-idx="${idx}">删除</button>
      </div>
    </div>
  `).join('');

  // 加载按钮
  $$('.btn-load-history').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const record = loadHistory()[btn.dataset.idx];
      if (!record) return;
      $('website_url').value = record.website_url || '';
      loadHistoryForDomain(record.domain);
      $('modalHistory').classList.add('hidden');
      showToast(`📂 已加载 ${record.domain}`);
    });
  });

  // 删除按钮
  $$('.btn-del-history').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!confirm('确定删除这条历史记录？')) return;
      const history = loadHistory();
      history.splice(btn.dataset.idx, 1);
      saveHistory(history);
      renderHistoryList();
      showToast('🗑 已删除');
    });
  });

  // 点击整行加载
  $$('.history-item').forEach(item => {
    item.addEventListener('click', () => {
      const record = loadHistory()[item.dataset.idx];
      if (!record) return;
      $('website_url').value = record.website_url || '';
      loadHistoryForDomain(record.domain);
      $('modalHistory').classList.add('hidden');
      showToast(`📂 已加载 ${record.domain}`);
    });
  });
}

// ─── 复制按钮 ─────────────────────────────────────────
function initCopyButtons() {
  $$('.btn-copy').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target;
      const target = $(targetId);
      if (!target) return;
      const text = target.tagName === 'TEXTAREA' || target.tagName === 'PRE'
        ? target.value || target.textContent
        : target.textContent;
      copyToClipboard(text, btn);
    });
  });
}

function copyToClipboard(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    if (btn) {
      const original = btn.textContent;
      btn.textContent = '✅ 已复制';
      btn.classList.add('copied');
      setTimeout(() => {
        btn.textContent = original;
        btn.classList.remove('copied');
      }, 2000);
    }
    showToast('✅ 已复制到剪贴板');
  }).catch(() => {
    showToast('❌ 复制失败，请手动选择复制');
  });
}

// ─── 状态栏 ───────────────────────────────────────────
function updateStatusBar(text, type = 'ready') {
  $('statusText').textContent = text;
  const dot = $('statusDot');
  dot.className = `status-dot ${type}`;
}

function addScrapeTag(label, status) {
  const tag = document.createElement('span');
  tag.className = `scrape-tag ${status}`;
  tag.textContent = label;
  $('scrapeProgress').appendChild(tag);
}

function clearScrapeProgress() {
  $('scrapeProgress').innerHTML = '';
}

// ─── 加载状态 ─────────────────────────────────────────
function setGenerateLoading(loading) {
  const btn = $('btnGenerate');
  const text = $('btnGenerateText');
  btn.disabled = loading;
  text.textContent = loading ? '⏳ 生成中...' : '生成文案';
}

function clearOutputs() {
  $('outputEnPreview').innerHTML = '';
  $('outputEnRaw').value = '';
  $('outputZhPreview').innerHTML = '';
  $('outputZhRaw').value = '';
  $('outputHtml').textContent = '';
  clearScrapeProgress();
}

// ─── Toast 提示 ───────────────────────────────────────
let toastEl = null;
let toastTimer = null;

function initToast() {
  toastEl = document.createElement('div');
  toastEl.className = 'toast';
  document.body.appendChild(toastEl);
}

function showToast(msg, duration = 2500) {
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), duration);
}

// ─── 工具函数 ─────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escAttr(str) {
  return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function extractDomain(url) {
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).hostname;
  } catch { return ''; }
}
