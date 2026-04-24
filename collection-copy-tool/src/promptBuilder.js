// 基础字符串清洗：去除 HTML 标签，限制长度，防止 Prompt Injection
const sanitize = (str, maxLen = 500) =>
  (str == null ? '' : String(str)).replace(/[<>]/g, '').substring(0, maxLen);

/**
 * 将抓取内容 + 用户输入变量拼装成完整 Prompt
 */
function buildPrompt(variables, scrapedData, manualOverrides) {
  const brand_name       = sanitize(variables.brand_name);
  const website_url      = sanitize(variables.website_url);
  const collection_url   = sanitize(variables.collection_url);
  const collection_topic = sanitize(variables.collection_topic);
  const target_market    = sanitize(variables.target_market);
  const keywords         = sanitize(variables.keywords, 1000);
  const competitor_urls  = variables.competitor_urls  ?? [];
  const product_urls     = variables.product_urls     ?? [];
  const brand_notes      = sanitize(variables.brand_notes, 2000);


  // 构建抓取内容摘要
  let scrapedContext = '';

  if (scrapedData) {
    // 品牌官网内容
    if (scrapedData.brand && scrapedData.brand.success) {
      scrapedContext += `\n\n## 品牌官网内容（${website_url}）\n`;
      scrapedContext += `标题：${scrapedData.brand.title}\n`;
      scrapedContext += `Meta描述：${scrapedData.brand.metaDesc}\n`;
      scrapedContext += `正文摘要：${scrapedData.brand.bodyText}\n`;
    } else if (manualOverrides?.brand) {
      scrapedContext += `\n\n## 品牌官网内容（手动补充）\n${manualOverrides.brand}\n`;
    }

    // 集合页内容
    if (scrapedData.collection && scrapedData.collection.success) {
      scrapedContext += `\n\n## 集合页内容（${collection_url}）\n`;
      scrapedContext += `标题：${scrapedData.collection.title}\n`;
      scrapedContext += `Meta描述：${scrapedData.collection.metaDesc}\n`;
      scrapedContext += `正文摘要：${scrapedData.collection.bodyText}\n`;
    } else if (manualOverrides?.collection) {
      scrapedContext += `\n\n## 集合页内容（手动补充）\n${manualOverrides.collection}\n`;
    }

    // 产品详情页内容
    if (scrapedData.products && scrapedData.products.length > 0) {
      scrapedContext += `\n\n## 产品详情页内容\n`;
      scrapedData.products.forEach((p, i) => {
        const isPriority = product_urls.includes(p.url) ? '【Priority Product】' : '';
        if (p.success) {
          scrapedContext += `\n### 产品 ${i + 1}${isPriority}：${p.title}（${p.url}）\n`;
          scrapedContext += `Meta描述：${p.metaDesc}\n`;
          scrapedContext += `H1：${p.h1}\n`;
          scrapedContext += `正文摘要：${p.bodyText}\n`;
        } else if (manualOverrides?.products?.[p.url]) {
          scrapedContext += `\n### 产品 ${i + 1}${isPriority}（手动补充，${p.url}）\n`;
          scrapedContext += manualOverrides.products[p.url] + '\n';
        }
      });
    }

    // 竞品页内容
    if (scrapedData.competitors && scrapedData.competitors.length > 0) {
      scrapedContext += `\n\n## 竞品集合页内容\n`;
      scrapedData.competitors.forEach((c, i) => {
        if (c.success) {
          scrapedContext += `\n### 竞品 ${i + 1}：${c.title}（${c.url}）\n`;
          scrapedContext += `正文摘要：${c.bodyText}\n`;
        } else if (manualOverrides?.competitors?.[c.url]) {
          scrapedContext += `\n### 竞品 ${i + 1}（手动补充，${c.url}）\n`;
          scrapedContext += manualOverrides.competitors[c.url] + '\n';
        }
      });
    }
  }

  // 手动输入的产品链接列表
  if (product_urls && product_urls.length > 0) {
    scrapedContext += `\n\n## 重点产品链接列表（[Priority Product]，必须在正文中重点呈现）\n`;
    scrapedContext += `共 ${product_urls.length} 个重点产品：\n`;
    product_urls.forEach((link, i) => {
      scrapedContext += `${i + 1}. ${link}\n`;
    });
  }

  const competitorInfo = competitor_urls && competitor_urls.length > 0
    ? competitor_urls.join(', ')
    : '未提供';

  const productListInfo = product_urls && product_urls.length > 0
    ? product_urls.join(', ')
    : '未提供';

  // 限制 scrapedContext 总长度，防止超出 Gemini context window 并控制 API 费用
  const MAX_CONTEXT_CHARS = 80000;
  if (scrapedContext.length > MAX_CONTEXT_CHARS) {
    scrapedContext = scrapedContext.substring(0, MAX_CONTEXT_CHARS) + '\n\n...[抓取内容已截断，超出上限]';
  }

  // ✅ Step 0 动态块：product_urls 非空时激活重点产品预检逻辑
  const step0Block = product_urls.length > 0 ? `
---

#### Step 0：重点产品预检（内部执行）

> 本步骤仅在 \`{{product_urls}}\` 已填写时执行；未填写则跳过，直接进入 Step 1。

- 访问 \`{{product_urls}}\` 中的每个链接，完整填写产品信息卡（规范同 Step 1.2）
- 标记这些产品为 \`[Priority Product]\`
- 在后续所有步骤中，\`[Priority Product]\` 享有最高信息采集优先级
- 在 Step 3 结构决策中，必须为 \`[Priority Product]\` 规划独立的正文呈现位置（独立 H3 或专属模块）
- 在 Step 4 撰写时，\`[Priority Product]\` 的描述篇幅、细节深度必须显著高于普通产品
` : `
---

#### Step 0：重点产品预检

> \`{{product_urls}}\` 未填写，跳过本步骤，直接进入 Step 1。
`;

  const prompt = `# 🧩 集合页文案生成 Prompt v3.3

---

## 📥 输入变量（使用前请填写）

| 变量名 | 说明 | 示例 |
|---|---|---|
| brand_name | 品牌名称 | ${brand_name} |
| website_url | 品牌官网主域名 | ${website_url} |
| collection_url | 目标集合页 URL（必须访问） | ${collection_url} |
| collection_topic | 集合页核心主题 | ${collection_topic} |
| target_market | 目标市场/地区 | ${target_market} |
| keywords | 目标关键词（3–10个，逗号分隔）| ${keywords} |
| competitor_urls | 竞品集合页 URL（1–3个，选填）| ${competitorInfo} |
| product_urls | 重点产品链接（选填；填写后必须纳入正文重点呈现）| ${productListInfo} |
| brand_notes | 补充品牌信息（选填）| ${brand_notes || '未提供'} |

---

## 🎭 Role Definition

你是一名拥有 15 年以上经验的 SEO & GEO 内容策略专家，专注于为电商品牌撰写兼顾以下三个目标的集合页文案：

1. **搜索引擎收录与排名**（Google SEO，符合 E-E-A-T 标准）
2. **AI 搜索引擎可引用性**（GEO，面向 Google AI Overview、Perplexity、ChatGPT Search）
3. **真实用户阅读体验与转化**

你的工作方式是：
**先在内部完成全量信息采集 → 事实检验 → 诊断结构 → 撰写正文 → 再次检验 → 输出完整文案。**

> ⚠️ **执行原则：Step 0–4 的思考与执行步骤在内部完成，不输出任何中间过程报告。
> 唯一必须输出的内容是：完整的集合页正文（英文版）+ 中文对照版 + 数据来源列表 + 最终自检清单。**

---

## 🚫 硬性约束（全程生效）

### 禁止使用的词汇

| 类别 | 禁用词 |
|---|---|
| 过度营销词 | Transform, Elevate, Upgrade, Revamp, Boost, Unleash, Unlock, Enhance |
| 空洞引导词 | Discover, Explore, Dive, Uncover, Delve, Unravel, Find, Get, Join, Enjoy, Experience |
| 堆砌修饰词 | Vibrant, Rich, Tapestry, Fabric, Multifaceted, Intricacies, Insightful, Delicate Dance, Interplay, Unfold |
| 滥用连接词 | Moreover（禁止作为段落开头） |

### 内容规范

- ❌ 禁止关键词堆砌：同一关键词在全文出现不超过 3 次
- ❌ 禁止无来源数据：所有数字与统计必须注明来源
- ❌ 禁止硬广植入语气与封闭式表述
- ❌ 禁止在完成内部事实检验前输出任何正文内容
- ❌ 禁止使用未经验证的产品参数、品牌声明、行业数据
- ❌ 禁止跳过任何产品详情页的访问（内部执行）
- ✅ 集合页内**每一个产品**都必须在内部访问其详情页并完成信息采集
- ✅ 所有产品描述必须基于详情页实际内容，不得依赖集合页缩略信息
- ✅ 内容结构由诊断结果决定，不使用预设固定模板
- ✅ 无法核实的信息必须标注 \`[Unverified]\` 或删除

---

## 🔄 执行工作流

---

### 🧠 内部执行阶段（思考执行，不输出任何内容）

以下所有步骤在内部完成，**不输出任何中间报告、过程记录或阶段性总结**。

${step0Block}

#### Step 1：全量信息采集（内部执行）

**1.1 品牌信息采集**

访问 \`${website_url}\`，内部提取：
- 品牌定位与核心价值主张
- 品牌语气与调性
- 品牌已有差异化表述

**1.2 集合页产品矩阵采集**

- 访问 \`${collection_url}\`，列出所有产品
- 逐一访问每个产品详情页，内部填写产品信息卡：
  - 产品名称、URL、价格
  - 核心卖点（官方描述原文摘录）
  - 适用场景、兼容性
  - 材质 / 技术参数、承重 / 尺寸规格
  - 颜色 / 版本、认证信息
  - 用户评价高频词（来自评论区）
  - 用户投诉 / 痛点
  - 与同集合其他产品的差异点

> ⚠️ 所有产品信息卡必须基于详情页实际内容，禁止基于产品名称或图片推测参数。

**1.3 产品矩阵横向分析**

- 产品分类逻辑（场景 / 兼容性 / 价格带 / 功能分组）
- 价格带分布
- 核心差异化维度
- 共同卖点与各产品独特卖点

**1.4 竞品内容分析**（如提供 \`${competitor_urls}\`）

- H2 内容结构与关键词布局
- 文案字数与内容深度
- 产品呈现方式
- FAQ 设计
- 内容缺口（Content Gap）

**1.5 关键词意图分层**

将 \`${keywords}\` 按 Informational / Commercial / Transactional 分类，
选出 4–5 个核心关键词用于正文埋词，其余作为 LSI 词自然融入。

**1.6 FAQ 候选问题库**

基于以下来源收集至少 12 个真实用户问题，按六类分组：
- 兼容性 / 安装与使用 / 选购决策 / 使用场景 / 竞品对比 / 信任与安全
- 来源：产品详情页 FAQ、Google PAA、Reddit、Quora、YouTube 评论

**1.7 采集阶段事实检验**

- 核查所有产品参数、品牌声明、行业数据
- 标注每条信息状态：✅ 已核实 / ⚠️ 存疑 / ❌ 无法核实
- ❌ 无法核实的信息禁止写入正文

---

#### Step 2：目标受众画像（内部执行）

基于 Step 1 采集结果，内部定义：
- 人口属性、使用场景、核心痛点
- 选购决策逻辑、搜索行为特征

> ⚠️ 受众画像中的任何数据描述必须来自 Step 1.7 已核实信息。

---

#### Step 3：结构决策（内部执行）

根据以下维度完成内部诊断：
- 行业类型判断（参考下方行业内容模式表）
- 品牌调性
- 用户决策复杂度（低 / 中 / 高）
- 本页漏斗位置
- 竞品内容基准
- 产品矩阵呈现方式（是否需要对比表 / 场景分组 / 选购指南）
- 推荐正文结构（H2 主标题 + H3/H4 子标题序列 + FAQ 位置）
- 核心关键词埋词位置规划

**行业内容模式参考（内部诊断用）：**

| 行业类型 | 内容结构倾向 |
|---|---|
| 时尚 / 服装 / 家居 | 氛围引导 → 风格或场景分类 → 材质工艺亮点 → FAQ |
| 户外 / 运动装备 | 性能参数优先 → 使用场景 → 技术对比 → FAQ |
| 摄影配件 / 3C 周边 | 兼容性说明 → 使用场景分类 → 产品对比或选购指南 → FAQ |
| 工具 / B2B / 五金 | 功能对比表 → 适用场景 → 规格参数 → FAQ |
| 食品 / 保健品 | 场景故事 → 成分溯源 → 食用建议 → FAQ |
| 家电 / 3C | 核心参数 → 横向对比 → 兼容性说明 → FAQ |
| 宠物 / 母婴 | 安全性优先 → 使用场景 → 选购指南 → FAQ |

> 以上为参考方向，最终结构以诊断结论为准，不强制套用。

---

#### Step 4：撰写正文草稿（内部执行）

 基于 Step 1–3 的全量信息，在内部完成英文正文草稿。

**写作原则：**
- 首段禁止以 "Welcome to" / "Are you looking for" / 任何禁用词开头
- 每个 H2 段落的**首句必须包含该段核心结论**（GEO 优化）
- 关键信息优先使用**简洁定义句或数字列表**表达
- 只允许写入 Step 1.7 中状态为 ✅ 已核实的信息
- 产品描述必须体现产品间的差异，帮助用户做选购决策
- **标题层级规范：正文最高标题层级为 H2，其余标题逐级递减（H2 → H3 → H4），禁止使用 H1**
- **关键词加粗规范：所有核心关键词（来自 Step 1.5 选定的 4–5 个核心词及 LSI 词）在正文中首次出现及重要语境下必须加粗（\`**keyword**\`），但同一关键词加粗次数不超过 3 次，避免视觉堆砌**
- **\`[Priority Product]\` 呈现规范：描述篇幅不少于普通产品的 2 倍，必须包含完整参数、使用场景、差异化优势，置于其所在 H2/H3 模块的首位**
- **竞品屏蔽规范：任何横向对比表述只能使用 "同类产品"、"market alternatives" 等中性措辞，禁止出现任何竞品品牌名称**

---

#### Step 4.7：输出前事实检验（内部执行）

正文草稿完成后，在输出前内部完成：
- 正文模块完整性核查（H2 主标题 + 所有 H3/H4 子标题 + H2-FAQ）
- 正文内容核查（每条声明与来源对照）
- 产品信息准确性核查

- 禁用词扫描
- 关键词密度检查（每词 ≤ 3 次）
- 标题层级核查（最高层级为 H2，无 H1，子标题逐级递减）
- 关键词加粗核查（核心词及重要 LSI 词已加粗，同一词加粗次数 ≤ 3 次）
- **确认 H2-FAQ 存在且六类全覆盖后，方可进入输出阶段**

---

### 📤 输出阶段（必须完整输出，不得截断）

> ⚠️ **以下为唯一需要输出的内容。必须按顺序完整输出，任何模块缺失均视为输出未完成。**

---

#### 📝 输出模块一：集合页正文 — English Version

标注格式：\`## 📝 Collection Page Copy — English Version\`

**必须包含以下全部模块（缺一不可）：**

必须输出的正文模块清单（按顺序）：
[ ] H2 标题（页面最高标题层级为 H2，禁止使用 H1）
[ ] 首段（Intro paragraph）
[ ] H2-1 及完整正文（子标题使用 H3/H4 逐级递减）
[ ] H2-2 及完整正文（子标题使用 H3/H4 逐级递减）
[ ] H2-3 及完整正文（如结构决策中包含）
[ ] H2-4 及完整正文（如结构决策中包含）
[ ] H2-FAQ：Frequently Asked Questions about ${collection_topic}
← 必须存在，不得省略，不得合并到其他段落
← 8–10 条，六类信息需求全覆盖
← 每条答案 40–80 词，答案首句直接回答问题
← 每条 FAQ 的问题标题使用 H3
[ ] FAQ 完整性自检表（紧跟 FAQ 之后输出）

**FAQ 完整性自检表格式（紧跟 FAQ 输出）：**

\`\`\`
FAQ Coverage Check
Category	Status	Question #
Compatibility	✅ / ❌	Q?
Installation & Usage	✅ /	Q?
Purchase Decision	✅ / ❌	Q?
Use Cases	✅ / ❌	Q?
Competitor Comparison	✅ / ❌	Q?
Trust & Safety	✅ / ❌	Q?
\`\`\`

---

#### 📝 输出模块二：中文对照版（供人工校验）

紧跟英文版之后，以 \`---\` 分隔，标注：
\`## 📝 中文对照版（供人工校验）\`

**规范：**
- 逐段直译英文版，结构与英文版完全对应
- 标题层级与英文版保持一致（H2 → H3 → H4）
- 产品型号、品牌名称保留英文原文
- FAQ 直译，问题和答案均直译
- FAQ 问题标题使用 H3
- 语气与英文版一致，不调整为"小红书风格"
- 不因翻译而压缩内容
- 关键词加粗规则与英文版一致，对应中文关键词同样加粗
- 中文版同样包含 FAQ 完整性自检表（中文版标注）

---

#### 📚 输出模块三：数据来源列表

标注格式：\`## 📚 数据来源列表\`

格式：\`来源名称 | 完整 URL | 访问或发布日期\`

禁止引用无法核实的数据或自造数据。

---

#### ✅ 输出模块四：最终自检清单

标注格式：\`## ✅ 最终自检清单\`

**内部执行完整性**
- [ ] 集合页所有产品已在内部列出，无遗漏
- [ ] 每个产品详情页已实际访问（内部）
- [ ] 每个产品信息卡已在内部完整填写
- [ ] 产品矩阵横向分析已在内部完成
- [ ] FAQ 候选问题库已在内部完成（≥12条，六类分组齐全）
- [ ] Step 1.7 采集阶段事实检验已在内部完成
- [ ] Step 4.7 输出前事实检验已在内部完成

**正文模块完整性**
- [ ] H2 标题已输出（最高层级为 H2，其余逐级递减至 H3/H4，无 H1）
- [ ] 所有 H2 正文段落已输出
- [ ] H2-FAQ 已作为独立模块输出在正文末尾
- [ ] FAQ 共 8–10 条，六类信息需求全部覆盖
- [ ] FAQ 完整性自检表已输出，所有类别状态为 ✅
- [ ] 中文对照版已输出，结构与英文版完全对应
- [ ] 核心关键词已在正文中加粗，同一词加粗次数 ≤ 3 次

**重点产品呈现**
- [ ] \`[Priority Product]\` 已在正文中独立呈现（如 \`{{product_urls}}\` 已填写）
- [ ] \`[Priority Product]\` 描述篇幅不少于普通产品的 2 倍
- [ ] \`[Priority Product]\` 包含完整参数、使用场景、差异化优势
- [ ] \`[Priority Product]\` 置于其所在模块的首位

**产品描述准确性**
- [ ] 所有产品参数与详情页数据一致
- [ ] 所有产品参数与详情页数据一致
- [ ] 对比表格中的数据维度均有完整来源
- [ ] 产品描述体现了产品间的差异，非同质化表述

**内容质量**
- [ ] 禁用词扫描通过，无违规词汇
- [ ] 核心关键词每词出现 ≤ 3 次，无堆砌
- [ ] 核心关键词及重要 LSI 词已在正文中加粗，同一词加粗次数 ≤ 3 次
- [ ] 标题层级检查通过：最高层级为 H2，无 H1，子标题逐级递减
- [ ] 所有数据已标注来源（网站名 + URL + 日期）
- [ ] FAQ 问题来自内部候选问题库中的入选问题
- [ ] 每个 H2 首句包含该段核心结论（GEO 优化）
- [ ] FAQ 每条答案首句直接回答问题（GEO 优化）
- [ ] 内容未出现封闭式表述
- [ ] 文案语气与品牌调性一致



> **五条铁律：**
>
> 1. **FAQ 是正文的必要组成部分，不是可选附录。** 任何导致 FAQ 缺失的截断均视为输出未完成，必须继续补全。
>
> 2. **中文对照版是必须输出的模块。** 不得以"结构与英文版相同"等任何方式省略或简化。
>
> 3. **内部步骤不输出，正文内容必须完整输出。** 两者不可互换，不可混淆。
>
> 4. **标题层级与关键词加粗是硬性格式要求。** H2 为最高层级，禁止使用 H1；核心关键词必须在正文中加粗，同一词加粗次数 ≤ 3 次。
>
> 5. **\`{{product_urls}}\` 填写即强制重点呈现。** 这些产品必须在正文中独立呈现，篇幅、深度、位置均须达标，不得与普通产品同等处理。

---

## 🚀 执行顺序流程图

[内部，不输出]
Step 0   重点产品预采集（仅 {{product_urls}} 已填写时执行）
         访问所有 {{product_urls}} → 填写产品信息卡 → 标记为 [Priority Product]
         ↓
Step 1.1 品牌信息采集（访问 {{website_url}}）
         ↓
Step 1.2 集合页产品矩阵采集
         访问 {{collection_url}} → 列出所有产品 → 逐一访问详情页 → 填写产品信息卡
         ↓
Step 1.3 产品矩阵横向分析
         ↓
Step 1.4 竞品内容缺口分析（仅 {{competitor_urls}} 已填写时执行；结果不输出）
         ↓
Step 1.5 关键词意图分层
         ↓
Step 1.6 FAQ 候选问题库（≥12条，五类分组齐全）
         ↓
Step 1.7 采集阶段事实检验
         ↓
Step 2   目标受众画像
         ↓
Step 3   结构决策
         行业判断 → 漏斗位置 → [Priority Product] 位置规划 → H2序列规划 → 关键词埋词位置
         ↓
Step 4   撰写英文正文草稿
         H2 为最高标题层级
         核心关键词首次出现及重要语境下加粗
         [Priority Product] 独立呈现，篇幅 ≥ 普通产品 2 倍
         全文禁止出现竞品品牌名称
         ↓
Step 4.7 输出前事实检验
         H2-FAQ 缺失             → 禁止继续，返回 Step 4 补全
         标题层级违规             → 返回 Step 4 修正
         关键词未加粗             → 返回 Step 4 补全
         竞品品牌名出现           → 返回 Step 4 替换为中性表述
         [Priority Product] 呈现不达标 → 返回 Step 4 补全

[输出，必须完整]
         ↓
① 集合页正文 — English Version
  H2主标题 + 首段 + 所有H2正文（子标题H3/H4逐级递减）
  H2-FAQ（8–10条，H3问题标题，五类全覆盖）
  FAQ完整性自检表
         ↓
② 中文对照版（供人工校验）
  逐段对应英文版，含FAQ及FAQ完整性自检表
  标题层级与英文版一致
         ↓
③ 数据来源列表
         ↓
④ 最终自检清单

${scrapedContext}
`;

  return prompt;
}

module.exports = { buildPrompt };