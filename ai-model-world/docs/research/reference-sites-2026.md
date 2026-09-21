# 参考网站调研与信息设计改进方案

> 调研时间：2026 年 9 月 1 日
> 起因：「读者并不能直观地看到每个模型的特点，还是有很大的理解成本。有没有类似的网站来作为参考，
> 使得可以同时保留整个网站的游戏感，又能让读者更清楚地了解到各个模型之间的区别？」
>
> 这份文档只做调研与设计论证，不改动任何代码。落地时请对照 [HANDOFF.md](../HANDOFF.md) 第四节
> 「不可违背的原则」逐条核对——本文所有方案都是在**数据诚信 / 零 AI 依赖 / 合规红线 / 跨赛制不混算**
> 四条约束内设计的，任何一条被违反都说明方案写错了，不是原则该让路。

> **关于「已经有人在改了」**：本文的体检数据（第一节）与诊断（第三节）取自 2026-09-01 上午的代码状态。
> 在本文成稿期间，仓库里已经出现了 `src/lib/persona.ts`（一句话人设）、
> `src/lib/aptitude.ts` + `src/components/character/AbilityBars.tsx`（四条分段能力横条）、
> `src/data/coding-leagues.ts`（编程赛制分列）——它们独立地实现了本文 P0-2 与 P1-1 的同类思路，
> 而且 `AbilityBars` 对缺数据的处理（斜纹空槽 + 问号，与零格截然不同）与本文 [5.1](#51-战力雷达图--五维属性条) 的论证完全一致。
>
> 两者的侧重点不同，建议合并而不是二选一：
> - 已实现的 `persona.ts` 走的是**用途式**措辞（「写代码的活儿它最拿手」），回答「我该拿它干嘛」；
> - 本文 [P0-2](#p0-2-一句话人设模板化但不生硬) 提的是**限定域最高级**（「开源模型里综合智力最强的」），回答「它凭什么与众不同」。
>
> 前者解决可用性，后者解决可区分性——正是用户反馈里的两个不同诉求。
> 本文其余部分（P0-1 名次抓手、P0-3 冠军卡、P0-4 砍常量家具、P0-5 样板房、P0-6 修 `valueScore`、
> P1-2 并排对比、P1-3 用途赛道、P1-6 版面分层）在成稿时尚未被实现。

---

## 采纳情况（2026-09-01 晚更新，后来者先读这里）

这份报告的建议已经落地了一部分。**动手前先看这张表，别把做完的再做一遍。**

| 编号 | 建议 | 状态 |
|---|---|---|
| P0-2 | 一句话人设：限定域最高级 | **已采纳**。`src/lib/persona.ts` 按本文算法重写，产出「全世界综合智力最强的模型」「十强里最划算的模型」这类句子。上文提到的「用途式措辞」那一版已被替换——实测它同屏撞车严重（四张卡同时写「百万级的记性」），而限定域最高级从结构上保证全站唯一 |
| P0-4 | 砍掉常量家具 | **已采纳**。`buildVisualPruning` 把稀有度裁剪从标签层推广到视觉层，阈值 60%。空桌、雾化斗篷、「会用工具」「会深思」图标现在会在广场层自动撤掉；书架降饱和为场景 |
| P0-6 | 修 `valueScore()` | **已采纳**，用的是本文方案二「分位差」而非方案一「Pareto 前沿」——排名需要标量，前沿只能给布尔。修完第一名从 Llama-3.1-8B（ECI 115）变成 DeepSeek V4 Flash（ECI 154.3，$0.28） |
| P1-1 | 五维分段属性条 | **已采纳为四条**（聪明/编程/记性/便宜）。砍掉「感官」是因为它是布尔集合不是连续量，用图标比用条合适 |
| P0-1 | 战力名牌重构（名次做成全卡最大数字） | **部分采纳**。名次进了「聪明」那一条的右侧短标（`世界#1`），但没有做成超大数字——四条横条本身已经是抓手，再加一个巨大数字会喧宾夺主 |
| P0-3 | 「今日格局」冠军卡横条 | **未做，推荐下一步做**。它现在还多解决一个新问题：广场改成「每家当代门面」之后，综合智力全球前二反而不在首页了 |
| P0-5 | 样板房解剖图 | **未做**。原图例 `Legend.tsx` 已直接删除——能力条改造之后卡片自解释，不需要说明书。若日后发现新访客仍然困惑，再按本文方案做样板房 |
| P1-2 | 并排对比模式 | **未做** |
| P1-3 | 用途赛道页 | **未做** |
| 5.1 | 不做雷达图 | **已遵循**，理由（覆盖率不支持、无法表达缺数据、面积随半径平方增长）完全成立 |
| 5.2 | 不造合成总评分 | **已遵循** |

本文成稿后另外发现的两条，是本文没预料到的：

- **编程那一条不能显示原始分数，也不能显示名次，只能显示分位档。** 原始分数跨赛制不可比；
  名次跨池不可比（分位池大小从 6 到 85 不等，「6 个里第 2」和「25 个里第 2」显示出来一样）。
  详见 [HANDOFF.md](../HANDOFF.md) 4.4。
- **门面选拔存在系统性偏向旧模型的偏差**，与信息设计无关但影响同一块画面。
  详见 [HANDOFF.md](../HANDOFF.md) 5.1「代际接班」。

---

## 目录

- [〇、给赶时间的人](#〇给赶时间的人)
- [一、体检：当前形态到底传达了多少信息](#一体检当前形态到底传达了多少信息)
- [二、参考网站调研](#二参考网站调研)
  - [2.1 游戏化 / 拟人化的数据可视化](#21-游戏化--拟人化的数据可视化)
  - [2.2 AI 模型对比类网站](#22-ai-模型对比类网站)
  - [2.3 图鉴 / 收集类界面范式](#23-图鉴--收集类界面范式)
  - [2.4 RPG 角色属性面板](#24-rpg-角色属性面板)
  - [2.5 横向对照总表](#25-横向对照总表)
- [三、诊断：当前设计在信息传达上的九条缺陷](#三诊断当前设计在信息传达上的九条缺陷)
- [四、改进方案](#四改进方案)
  - [P0](#p0必做收益最大)
  - [P1](#p1)
  - [P2](#p2)
- [五、专题论证：六个指定思路的展开](#五专题论证六个指定思路的展开)
- [六、明确不建议做的事](#六明确不建议做的事)
- [七、验收标准](#七验收标准)
- [八、参考链接总表](#八参考链接总表)

---

## 〇、给赶时间的人

**核心判断**：现在的问题不是「像素画不好看」，而是**视觉编码的信息量分配错了**。
屋子里 200×246 像素的画面，有一大半在表达全场都一样的东西（79% 的屋子是同一张空桌、
77% 的角色披同一件雾），而真正能区分模型的那几件事（谁最强、多贵、适合干什么）
要么被压成 12px 的角落小字，要么根本没有表达。

**三个最值得抄的参考**：

1. **[LLM Stats](https://llm-stats.com) 的首屏「冠军卡」条**——六张卡，每张一句
   *限定域最高级* + 模型名 + 证明它的那个数字（`cheapest in the top 10 / Grok 4.5 / $2.00/M tok`）。
   零学习成本，五秒读完当下格局。
2. **[FIFA Ultimate Team 卡片](https://futgraphics.com/articles/the-evolution-of-fut-cards-a-visual-history-from-fifa-09-to-ea-fc-24) 的信息层级**——
   左上角一个最大字号的总评数字，底部一行属性，卡框颜色即等级。
   *但它的总评算法不能抄*，理由见 [5.2](#52-单一综合评分)。
3. **[宝可梦图鉴的种族值条形图](https://mintlify.wiki/scriptvg/compo-dex/components/pokemon-stats)**——
   六条统一归一化（max=255）的横条、条上带数字、颜色分段。
   缺数据时显示 `???` 而不是画一根零长度的条。这是雷达图做不到的。

**P0 改进方案（六条）**：

| 编号 | 方案 | 一句话 |
|---|---|---|
| P0-1 | 战力名牌重构 | 把名次做成全卡最大的数字，配「全球前 5%」分位带 |
| P0-2 | 一句话人设 | 从宽到窄找第一个「它在这个范围里排第一」的说法 |
| P0-3 | 今日格局冠军卡 | 首屏六张超级卡，抄 LLM Stats |
| P0-4 | 砍掉常量家具 | 把 35% 稀有度裁剪从标签推广到家具与图标 |
| P0-5 | 样板房解剖图 | 用一间被引线标注的样板房替代九条对照表 |
| P0-6 | 修 `valueScore()` | 现有的 `eci/price` 比值让「性价比之王」被廉价老模型垄断，改用 Pareto 前沿 |

> P0-6 是这次调研的**意外发现**：实算显示「性价比之王」当前会颁给
> Llama-3.1-8B-Instruct（$0.08，ECI 115.3），而不是任何一个当代主力模型。
> 详见 [P0-3 的坑三](#p0-3-今日格局冠军卡横条)。

---

## 一、体检：当前形态到底传达了多少信息

在讨论怎么改之前，先把「现在这一屏实际传达了什么」量化出来。
下列数字全部由 `data/models.json`（485 模型 / 42 厂商）与 `buildPlazaRoster()` 实测得出，
广场默认阵容为 **39 间屋**（西岸 22 + 东方 17，另有 3 户折叠在「无名旅人」里）。

### 1.1 广场 39 间屋的字段覆盖率

| 视觉维度 | 承载字段 | 广场有数据的屋子 | 覆盖率 |
|---|---|---|---|
| 头顶冠冕 / 名次 | `benchmarks.eci` | 12 / 39 | **31%** |
| 右侧电脑 | 任一 SWE 成绩 | 8 / 39 | **21%** |
| 左侧书架 | `contextWindow` | 33 / 39 | 85% |
| 服饰华丽度 | `pricing.outputPerMTok` | 29 / 39 | 74% |
| 体型（非估算） | `params.totalB` | 9 / 39 | **23%** |
| 眼镜（图像输入） | `modalities.input` | 18 / 39 | 46% |
| 工具腰带 | `capabilities.toolCall` | 29 / 39 | 74% |
| 思考光环 | `capabilities.reasoning` | 27 / 39 | 69% |
| 钥匙（开源） | `openWeights` | 20 / 39 | 51% |

### 1.2 有多少视觉维度实际上是「常量」

| 现象 | 实测 | 后果 |
|---|---|---|
| 桌上是同一张盖布问号桌 | **31 / 39 = 79%** | 屋子右侧 1/3 的宽度，全场传递 0 bit 差异 |
| 角色披雾化斗篷 | **30 / 39 = 77%** | 「雾 = 参数量未公开」退化成默认皮肤 |
| 书架落在顶两档（≥256K） | **23 / 39 = 59%** | 书架高度在旗舰之间几乎不可分 |
| 书架落在最高档（≥1M） | 16 / 39 = 41% | 16 间屋的书架完全一样 |
| 名牌右下显示「未参赛」 | **27 / 39 = 69%** | 名次这个最强抓手，七成屋子没有 |
| 挂着「会用工具」图标 | 29 / 39 = 74% | 满屏都有 = 等于没有 |
| 挂着「会深思」图标 | 27 / 39 = 69% | 同上 |

> **这里有一个自相矛盾**：`assignTraits()` 已经实现了 35% 稀有度裁剪——
> 「一块标签在同屏模型里出现率超过 35% 就自动剪掉」。
> 但这条自校准规则**只作用于文字标签，没有作用于家具、叠加层和属性图标**。
> 结果就是标签层很干净，而画面层堆满了出现率 69%–79% 的「常量」。

### 1.3 五维联合覆盖率（决定能不能画雷达图）

以「综合智力 / 编程 / 上下文 / 价格 / 感官」为五轴统计，
一个模型身上同时有几个轴的数据：

| 有几个轴 | 广场 39 间 | 全库 485 个 |
|---|---|---|
| 0 轴 | 6 | 81 |
| 1 轴 | 3 | 67 |
| 2 轴 | 9 | 102 |
| 3 轴 | 8 | 117 |
| 4 轴 | 10 | 75 |
| **5 轴全有** | **3 (8%)** | **43 (9%)** |
| ≥4 轴 | 13 (33%) | 118 (24%) |

**同时拥有综合智力分与编程分的广场模型只有 4 个。**
这组数字直接决定了 [5.1](#51-战力雷达图--五维属性条) 的结论。

### 1.4 版面几何

浏览器实测（1440×900，`--room-w: 200px`）：

- 单间屋卡片：**200 × 246 px**（屋内剖面 200×132 + 名牌约 114）
- 首屏（900px 高度带）内相交的屋子：**18 间**
- 整页文档高度：2514 px ≈ **2.8 屏**
- 顶部占用：header 132px + 图例折叠行

对比：

- [models.dev](https://models.dev) 一屏约 40 行（纯表格）
- [LLM Stats](https://llm-stats.com) 首屏 = 6 张冠军卡 + 15 行排行榜
- 宝可梦图鉴网格视图一屏 20–24 个

---

## 二、参考网站调研

### 2.1 游戏化 / 拟人化的数据可视化

#### 2.1.1 Neal.fun — The Deep Sea / The Size of Space

- 站点：<https://neal.fun/deep-sea/> · <https://neal.fun/size-of-space/>
- 作者主页：<https://nealagarwal.me/>
- 评述：<https://flowingdata.com/2019/12/05/scroll-scroll-scroll-through-the-depths-of-the-ocean/>
- 学术命名：*Progressive Value Reading*，<https://arxiv.org/abs/2602.19853>

**具体手法（可照抄）**

1. **量级 → 身体动作时长**。深度不是写成「3800 米」，而是让你**滚动**过去。
   读者不是「知道了距离」，而是「用手走过了距离」。
2. **沿途放已知锚点（anchor）**。潜水员 → 抹香鲸 → 泰坦尼克号 → 马里亚纳海沟。
   论文把锚点拆成两个维度：*visual / verbal* × *physical-space / data-space*。
   典型例子：横滚太阳系图里用「要滚多少屏」（verbal + physical-space）
   和「开车过去要多少年」（verbal + data-space）两种锚点同时校准。
3. **零图例**。全站没有一处解释「1 像素 = 多少米」。锚点物自己就是刻度尺。
4. **在空间上有意思的那一刻才投放事实**，不在开头一次性交代。

**对本项目的直接映射**

> 「上下文窗口 1,000,000 tokens」对普通人是天文数字。
> 换成锚点：**≈ 一次读完《哈利·波特》全七部（约 108 万词）**。
> 「200K」≈ 一部《三体》。「32K」≈ 一篇长论文。
> 这不需要任何新数据源，只是一张写死的换算查表——和 `vendor-registry.ts` 同性质的
> 「唯一依赖人类常识的一层」，加不加系统都能跑。

#### 2.1.2 Nicky Case — ncase.me

- Parable of the Polygons：<https://ncase.me/polygons/>
- The Evolution of Trust：<https://ncase.me/trust/>
- To Build A Better Ballot：<https://ncase.me/ballot/>
- 方法论原文：<https://blog.ncase.me/how-i-make-an-explorable-explanation/> ·
  <https://blog.ncase.me/explorable-explanations/> ·
  <https://ncase.me/StanfordTalk/transcript.html>

**具体手法（可照抄）**

1. **Show, then tell —— 顺序不能反**。原话：「'Show don't tell' is good for fiction,
   not so much for non-fiction... don't just show and tell, **show then tell**.
   Concrete, then abstract. Familiar, then unfamiliar.」
   配套口诀 **PEA**：Pictures, Examples, Analogy。
2. **先给一个具体动作**。Polygons 一上来就让你拖拽方块，Trust 一上来就让你对局。
   不是先讲什么是谢林模型 / 囚徒困境。
3. **Therefore & But，而不是 listicle**。「这样，所以那样，但是这样，所以……」
   ——一个连着的故事，而不是九条并列的说明。
4. **小机制先单独教，sandbox 放最后**。
5. 反直觉的一条：「**by withholding an explanation, the explorable explanation can be
   more effective**」——扣住解释反而提高读者去找答案的动机。

**对本项目的直接映射**

现在的 `Legend.tsx` 正是一个**九条并列的 listicle，而且默认折叠**。
它同时踩中了 Case 说的两个坑：先抽象后具体（先给对照表，再让你去看屋子），
以及 listicle 而非故事。替代方案见 [P0-5](#p0-5-样板房解剖图代替九条对照表)。

#### 2.1.3 The Pudding

- 站点：<https://pudding.cool/>
- 近期作品举例：
  - 《Why some people mow a lawn better than others.》<https://pudding.cool/2026/06/mow>
  - 《Which teams don't need asterisks by their title?》<https://pudding.cool/2026/06/ethical-champions>
  - 《Tracking 1,000+ people through the ups and downs of their relationships.》<https://pudding.cool/2026/06/love-story>

**具体手法（可照抄）**

1. **标题永远是一个人话问句或人话结论，副标题一句就把选题说清**。
   不是「NBA 冠军数据分析」，是「哪些球队的冠军不需要打星号？」
2. **卡片索引用手绘贴纸做筛选器**（Our Faves / Popular / Updating / Your Input / Video / Audio），
   视觉趣味完全由装饰承担，信息结构本身是极简的编号 + 日期 + 缩略图 + 一句话。
3. **趣味归趣味，信息层级不打折**：每张卡片只有 4 个元素。

**对本项目的直接映射**

这正是「游戏感和可读性不冲突」的证明：**趣味放在装饰层（贴纸/像素画），
信息放在结构层（编号/一句话），两层不互相污染**。
现在的项目把趣味和信息混在同一层（用衣服的华丽度表达价格），才产生了理解成本。

#### 2.1.4 NYT «You Draw It» / Bloomberg 猜谜式图表

- 原作：<https://www.nytimes.com/interactive/2017/04/14/upshot/drug-overdose-epidemic-you-draw-it.html>
- 实验证据：Kim, Reinecke, Hullman, *Explaining the Gap: Visualizing One's Predictions
  Improves Recall and Comprehension of Data*, CHI 2017
  <https://pages.cs.wisc.edu/~yeaseulkim/assets/papers/2017_explaning_gap_chi.pdf>
- 后续对照实验：<https://arxiv.org/html/2401.05511v1>
- 设计空间综述：<https://cav-lab.github.io/media/papers/VIBEEuroVis22.pdf>

**具体手法**：**先让读者猜，再揭晓**。CHI 2017 的对照实验结论是，
让读者先画出自己的预期再看真实数据，能显著提升**回忆准确度与理解度**，
而且对读者原本不熟悉的数据集提升最大——正好是「完全不懂大模型的普通人」这个受众。

2024 年那篇后续实验补了一条重要的**反向**发现：加上「对比叙事」（同时展示两条差异极大的走势）
会提高兴趣与惊讶感，**但也会提高回忆错误率**，因为认知负荷上升了。
结论：猜谜可以做，但一次只猜一件事。

#### 2.1.5 a16z AI Town

- 仓库：<https://github.com/a16z-infra/ai-town>
- 角色定义：<https://github.com/a16z-infra/ai-town/blob/main/data/characters.ts>

**技术事实**：PixiJS 渲染，32×32 精灵（`/assets/32x32folk.png`），
Tiled 导出的两层瓦片地图（`bgtiles` / `objmap`），角色移动速度 0.75 tile/s。

**这里要抄的是它的失败面，不是成功面**：AI Town 里八个小人（`f1`–`f8`）
共用同一张精灵表，角色形象**完全不承载任何语义**——你分不出哪个是 Lucky 哪个是 Alex，
所有信息都在侧栏的对话流里。它证明了 32×32 这个分辨率下**角色只能做氛围，不能做数据**。

这与本项目 [DESIGN.md](../DESIGN.md) 第 2.0 节记录的第一次失败（「64 像素这个分辨率
根本承载不了『谁会写代码』」）是同一条结论，只是本项目当时的修复方向是「把信息移到屋子里」，
而 AI Town 的做法是「把信息移出画面，交给 HUD」。**后者更彻底，也更该被采纳。**

---

### 2.2 AI 模型对比类网站

> 以下只研究信息设计。本项目 **不使用 Artificial Analysis 的任何数据**
> （其条款禁止再分发），**不抓取 LMArena**（其 ToS 禁止自动化抓取）。
> 见 [HANDOFF.md](../HANDOFF.md) 4.2。

#### 2.2.1 LLM Stats —— 最值得抄的一个

- 首页：<https://llm-stats.com/>
- 对比页：<https://llm-stats.com/models/compare>
- 用途榜：<https://llm-stats.com/leaderboards/best-ai-for-coding>
- 方法论：<https://llm-stats.com/methodology/llm-stats-score>

**手法一：首屏「冠军卡」横条（六张）**

实抓的原文（2026-09-01）：

```
leads on reasoning        wins at coding          cheapest in the top 10
GPT-5.6 Sol               Claude Opus 5           Grok 4.5
94.6% gpqa                27 arena                $2.00/M tok

fastest output            longest context window  best open-weights
GPT-4.1                   Grok-4 Fast Reasoning   Kimi K3
529 tok/s                 2.0M tokens             93.5% gpqa
```

每张卡严格三行：**限定域最高级（小字灰）→ 模型名（大字）→ 证明它的那个数字 + 单位**。

关键在第三张：`cheapest in the top 10`——不是「最便宜」，是「**前十强里**最便宜」。
限定域收窄之后，这句话既稀有又有用。这个技巧是 [P0-2](#p0-2-一句话人设模板化但不生硬) 的直接来源。

**手法二：用途赛道做一级导航**

```
Coding · Writing · Math · Research · Long Context · Tool Calling · Reasoning · Image Gen · Video Gen
```

配一句用途说明：`Best AI for Coding — Code generation & debugging`。
普通人不问「哪个模型 ECI 最高」，问「我要写代码用哪个」。

**手法三：分数与价格永远成对出现**

Performance Index 的每一行都是 `序号 · logo · 模型名 · 分数 · 价格`：

```
01  Claude Mythos Preview   56.5    —
02  GPT-5.6 Sol             56.0    $7.78
03  Claude Opus 5           54.7    $7.22
04  Kimi K3                 53.3    $4.33
05  GLM-5.3                 53.3    $1.73
```

第 4、5 名同分 53.3 但价格差 2.5 倍——**把两个数字并排放，结论自己就跳出来了**，
不需要额外画性价比图。注意第 1 名的价格是 `—` 而不是 0。

**手法四：对比页给预置对局，不让用户自己想比什么**

标题：`Start with a popular comparison / Live data · canonical matchups`

| 标签 | 对局 | 副标题 |
|---|---|---|
| Flagship | Claude Mythos Preview vs GPT-5.6 Sol | Highest benchmark scores |
| Fastest | GPT-4.1 vs Claude Haiku 4.5 | Observed output speed |
| Best value | DeepSeek-V4-Flash-0423 vs Gemma 4 31B | Quality for the token price |
| Open weights | Kimi K3 vs Qwen3.8 Max | Leading non-proprietary models |

URL 规则：`/models/compare/{a}-vs-{b}`（静态可预生成）。

**手法五：一句和本项目原则完全一致的话**

> "A consistent view of benchmark quality, token pricing, context, observed API performance,
> modality, and license. **Missing live measurements are left blank rather than estimated.**"

——「缺失的实测值留空，而不是估算」。可以直接引用到本站的数据说明里。

#### 2.2.2 Artificial Analysis（**只看设计，绝不用其数据**）

- <https://artificialanalysis.ai/>

**手法一：把结论直接标在图上。**
`Intelligence Index vs. Cost per Task` 散点图上有两个图注：
**`Most attractive quadrant`**（阴影区）和 **`Pareto line`**（前沿线）。
读者不需要自己推导「左上角好」，图自己说了。

**手法二：每个指标后面跟一句方向说明。**
`Artificial Analysis Intelligence Index · Higher is better`、
`Weighted average cost (USD) per Intelligence Index task · **Lower is better**`。
一行小字，消灭了「数字大是好还是坏」这个理解成本。

**手法三：指数就地列出它的成分。**
「Intelligence Index v4.1.1 incorporates 9 evaluations: GDPval-AA v2, 𝜏³-Banking,
Terminal-Bench v2.1, SciCode, ...」——合成分数**在每一次出现的地方**都重复交代成分。

**手法四：`Model Recommender`。**
"Get personalized model recommendations that optimize for your priorities across
intelligence, speed, and cost." —— 把「我该用哪个」做成一个可交互的入口，而不是一张表。

**手法五：`Openness Index`。**
把「开源程度」做成 0–18 的**可拆解分量**指数（权重是否公开、许可、论文、数据…），
而不是一个 open/closed 布尔值。本项目现在的 `openWeights` 正是那个布尔值。

#### 2.2.3 models.dev

- <https://models.dev/>（本项目的元数据上游，MIT）

**手法**：极端密度的对照组。一张 14 列的表，一行一个模型：

```
Model | Lab | Providers | Context | Output | Input | Reasoning | Tool Call |
Structured | Temperature | Weights | Price | Release | Updated
```

零装饰、零隐喻、一屏 40 行。**它是本项目在「一屏能看几个模型」这个指标上的上限参照。**
本项目不该变成它，但应该知道自己现在慢了它 5 倍。

值得注意的一个细节：`Price` 列直接写 `$0.67 / $2.00`（输入/输出并排），
而不是分两列——一个格子放两个数字，省一半宽度且语义不丢。

#### 2.2.4 OpenRouter 模型页

- 举例：<https://openrouter.ai/anthropic/claude-opus-4.5>

**手法一：Hero 区只放四个事实。**

```
Modalities        In / Out Price        Context        Released
                  $5 / $25 per 1M       200K           Nov 24, 2025
```

四个，不是十四个。其余全部下沉到锚点导航
（Providers / Pricing / Performance / Uptime / Benchmarks / Apps / Activity / FAQ）。

**手法二：区分「标价」与「实付价」。**

> "The average price customers actually pay for this model, next to the prices providers post.
> Caching and discounts mean the price actually paid is often well below the listed one."
> `Weighted Avg Input Price: $3.553 /M tokens`（标价 $5）

**手法三：同一模型的多家 provider 做成一张小表**（延迟 / 吞吐 / 可用率），
并解释路由模式：`Balanced (price + speed)`、`Nitro (fastest)`、`Exacto (highest tool-calling accuracy)`。
——即使是技术细节，也用「三个人话名字」代替参数。

#### 2.2.5 LMArena（**只看设计**）

- <https://lmarena.ai/leaderboard>
- 方法论开源包：<https://arena.ai/blog/arena-rank/>
- 读法指南：<https://www.propelcode.ai/blog/lm-arena-rank-spread-confidence-intervals-guide>

**手法**：每个分数都带 **95% 置信区间**（bootstrap 1000 次重采样）。
配套的读法是「**score gap + CI overlap + vote depth 三者一起看**」，
并明确写出：**CI 重叠 = 统计上并列，名次先后无意义**。
经验阈值：BT 分差 30–50 分才算一个有统计意义的名次台阶；
战斗数 < 1000 时真实名次可能浮动 5–10 位。

分赛道：Overall / Coding / Math / Vision / Hard Prompts / Multilingual / Style Control。
指南甚至建议「**Skip Overall, go to specialized rankings**」。

**对本项目的映射**：现在 `#9` 戴银冠、`#11` 不戴冠，这条 2–5 / 6–10 的硬边界
在统计上很可能是噪声。见 [P2-3](#p2-3-名次的并列带)。

#### 2.2.6 Epoch AI

- <https://epoch.ai/benchmarks> · <https://epoch.ai/eci> · <https://epoch.ai/data/ai-models>

本项目的榜单上游（CC-BY 4.0）。信息设计上值得注意的一点：
Epoch 把「Data explorers」和「Our benchmarks」分成两组导航——
**「查数据」和「看结论」是两种不同的用户意图，不该混在一个入口里**。
本项目的 `/leaderboard` 现在同时承担了这两件事。

---

### 2.3 图鉴 / 收集类界面范式

#### 2.3.1 宝可梦图鉴（Pokédex）

- 组件库规格（对信息设计描述最精确的一份）：
  <https://mintlify.wiki/scriptvg/compo-dex/components/pokemon-stats> ·
  <https://mintlify.wiki/scriptvg/compo-dex>
- 一份完整的图鉴 UI 规格文档：
  <https://github.com/niltsiar/kotlin_multiplatform_pokedex/blob/main/docs/project/ui_ux.md>

**具体手法（可照抄到像素）**

1. **六条种族值横条，统一归一化到 max = 255。**
   > "Each bar is normalized against a configurable maximum value **so comparisons between
   > Pokémon are meaningful and visually consistent**."
   跨个体可比的前提是**共用同一把尺子**——这正是本项目 [4.4 跨赛制分数永不混算](../HANDOFF.md)
   在讲的同一件事。
2. **每条的结构固定**：`属性名（左） · 数值（右） · 进度条（中）`。
   条上**必须带数字**，条本身只做粗略比较。
3. **颜色分段**：`<50 红 / 50–99 黄 / ≥100 绿`。三档，不是五档。
4. **属性徽章（Type Badge）是填充药丸 + 白字 + 官方色**，双属性并排。
   高对比填充，不是描边。
5. **层级顺序**（这份规格明确标注「Base Stats Section 是视觉上最突出的」）：
   `大剪影 → 名字 → #编号 → 属性徽章 → 身高体重卡 → 特性 → 种族值条`。
   注意：**编号在名字下面、小字**；徽章在剪影正下方。
6. 动画：条从 0 填充到目标值，六条错开 200ms 依次入场。
7. **未捕获的宝可梦显示 `???`**——缺数据不是画一根零长度的条。

#### 2.3.2 FIFA Ultimate Team 卡片

- 视觉史：<https://futgraphics.com/articles/the-evolution-of-fut-cards-a-visual-history-from-fifa-09-to-ea-fc-24>
- 设计演变分析：<https://energy.co.kr:455/news/a-look-at-historical-fifa-card-design.html>
- EA 前 UI 设计师作品页：<https://stefandinca.ro/fifa20.html>
- 评分算法：<https://earlygame.com/fifa/fifa-ratings-explained-overall-rating-1> ·
  <https://www.goal.com/en-us/news/fifa-player-ratings-explained-how-are-the-card-number--stats-decided/1hszd2fgr7wgf1n2b2yjdpgynu>

**布局手法**

> "A great card design guides your eye effortlessly. **In less than a second**, you should be
> able to process the rating, the player's face, their nation/club, and then the key stats."

- **OVR 在左上角，是全卡最大的字号**。视线动线：`评分 → 头像 → 国旗/俱乐部 → 属性`。
- **卡框颜色即等级**（铜 / 银 / 金），一眼分档，不需要读数字。
- FC24 起，六项属性从两列改成**底部单行**，把空间让给头像。
- 特殊卡（TOTS 等）共用同一套模板，只换配色——**基础卡越干净，特殊卡越亮眼**。

**算法手法（这部分是关键，也是本项目不能照抄的部分）**

OVR 不是「六项平均」。它是 **35 项属性 × 位置系数**（系数和为 1）：
中后卫的抢断/头球/拦截权重高于射门；范迪克 FIFA 20 的 88 分只由 29 项可见属性中的 **11 项**决定，
再加国际知名度（1–5 星）修正 +0～+3。

**成立的前提是：EA 对全部 19,000 名球员都有完整的 35 项数据。**
本项目广场上五轴全有的模型只有 3/39。这一条决定了 [5.2](#52-单一综合评分) 的结论。

**位置加权这个思路本身极其值得借鉴**，只是要换个落地形式：
FIFA 用「位置」决定权重，本项目应该用「**用途**」决定看哪个榜——
写代码看编程榜，读长文看上下文榜。见 [P1-3](#p1-3-用途赛道页)。

#### 2.3.3 NBA 2K 球员卡与徽章系统

- 徽章体系：<https://www.prismnews.com/hobbies/nba-2k/nba-2k-badges-explained-requirements-tiers-and-build>
- 设计初衷（2K15 引入时）：<https://nba2kw.com/nba-2k15-new-badges-system-replaces-signature-skills-and-will-differentiate-players-even-more-than-ever>
- 玩法总监访谈：<https://www.sportingnews.com/ca/nba/news/nba-2k20-gameplay-director-mike-wang-talks-nba-2k-ratings/9q8twrhdcmhr1lvwacioibe4f>
- 徽章 vs 属性的关系：<https://forums.operationsports.com/forums/nba-2k-basketball/976723-badge-efectiveness-vs-ratings-2k20-vs-2k21.html>

**核心洞察：徽章表达「身份」，属性表达「上限」。**

> "Badges are the bridge between your attribute spread and your on-court identity."
> "They are not just passive perks tacked onto a player card. They translate what your
> MyPLAYER is **built to do** into real actions on the floor."

玩法总监 Mike Wang 说得更直接：
> "the numbers don't always tell the full story. That's where the improved badge system comes in."
> 约基奇的价值有一大堆「无形项」，用属性数字表达不出来，只能靠徽章。

**两个可抄的机制**

1. **徽章分档**：Bronze → Silver → Gold → Hall of Fame → Legend，
   且**每一档由属性阈值门控**（Legend 需要该项属性 95+）。
   徽章不能凌驾于属性之上，只能放大它。
2. **徽章名本身就是人话**：`Limitless Range`、`Lockdown`、`Post Powerhouse`、`Handles For Days`。
   不是「三分命中率修正 +7%」。

**对本项目的映射**：`traits.ts` 已经做对了「人话标签」这一半
（「全球最强」「白菜价」「百万记性」），但**没有分档**。
现在「五强」和「十强」是两块不同的标签；改成同一块标签的银档和铜档，
既省了标签种类，又让档位可比。见 [P1-5](#p1-5-标签分档)。

#### 2.3.4 卡牌游戏的通用布局法则（炉石 / MTG / 桌游）

- 炉石首席美术 Ben Thompson 复盘：<https://hearthstone.blizzard.com/en-us/news/13023802>
- 炉石可读性研究：<https://www.nickkinggamedesign.com/hearthstone-design-study>
- 卡牌图形设计六条规则：<https://shufflekit.com/blog/game-card-graphic-design-rules>
- 卡面解剖：<https://fantastic-factories.medium.com/anatomy-of-a-card-840cdc2404c1>
- 三原则：<https://danielsolisblog.blogspot.com/2024/02/three-principles-of-card-design.html>

**法则一：只有三样东西是必需的。** 炉石团队的原话：
> "we asked ourselves what were the most important pieces of information to convey to the
> player: **the numeric values, the card title, and the card art.** Once these three
> elements were addressed, **anything else was seen as a bonus**."

他们试过极其华丽的材质堆叠版本，结论是「视觉太复杂，把注意力从最重要的
攻击/生命/费用上全部抢走了」。**这句话可以直接贴在本项目的屋子设计上。**

**法则二：位置即语义，且必须跨卡型固定。**
费用左上（手牌扇形展开时左上角永远可见）、攻击左下、生命右下。
MTG 把法术力费用放右上是历史包袱，靠几十年的用户习惯硬扛下来的；新设计不该学。

**法则三：关键词化 + 颜色恒定。**
炉石把「敌方角色必须先攻击这个随从」压缩成一个词 `Taunt`。
《杀戮尖塔》的 Patch 44 做了 250+ 条措辞一致性修订，定下的规则包括：
- **关键词恒为金色**（Block、Vulnerable…）
- **数字与百分比恒为蓝色**
- 「card / cards / relic / buffs」这类通用词恒为小写且不着色
- **关键词有固定出现顺序**：`Unplayable > Innate > Ethereal > 卡面描述 > Exhaust`

一致性本身就是可读性。

**法则四：文本写完砍一半。**
> "Write your card text, then cut it in half. If it still makes sense, you're on the right track."

---

### 2.4 RPG 角色属性面板

#### 2.4.1 《杀戮尖塔》

- UI 复盘：<https://www.cloudfallstudios.com/blog/2018/2/20/flash-thoughts-slay-the-spires-ui>
- 认知负荷分析：<https://uxcheckpoint.com/p/on-cognitive-load-and-clarity>
- 措辞一致性补丁：<https://gameupdatenotifier.com/g/slay-the-spire/v/weekly-patch-44-chrysalis>
- 产品视角复盘：<https://blog.birdor.com/slay-the-spire-deckbuilding-product-case-study/>

**手法一：定义「这一屏必须同时可见的三件事」。**
> "A new player sees their hand, the enemy intent, and the energy budget **at once**.
> That single screen explains the product better than a paragraph could."

——手牌、敌人意图、能量预算。三件，同屏，不需要点开任何东西。

**手法二：用图标形态而不是数字表达严重程度。**
> "The changing icons of the weapons at new thresholds of damage is a great way to help
> players intuit the severity of the situation, in a way that feels more visceral than just numbers."

敌人意图图标会随伤害档位换形（小刀 → 大刀 → 巨剑）。**这是「档位视觉化」的正面案例**，
和本项目的电脑档位是同一个思路——区别在于杀戮尖塔的图标之间形态差异极大，而且**总是有值**。

**手法三：进度式披露。** 前期刻意限制机制数量，让玩家先内化核心概念。

#### 2.4.2 《文明 VI》文明选择界面

- 领袖能力/议程总表：<https://www.eurogamer.net/civilization-6-leader-list-agenda-trait-unit-4879>
- 维基：<https://civilization.fandom.com/wiki/Leaders_(Civ6)>
- 社区替代方案（对官方界面的批评）：<https://forums.civfanatics.com/threads/sukritacts-civ-selection-screen.605526/>

**手法**：每个文明的信息被压缩成四件事——
**独特能力（一句）+ 领袖议程（一句性格）+ 独有单位 + 独有建筑/改良（各一个图标）**。

**这里同时有一个反面教训**：官方原版把文明选择做成一个下拉框，
社区的原话是「Nothing less interesting than **a wall of text** for reading about every unique」，
于是有人做了 Sukritact's Civ Selection Screen——网格 + 图标 + 分层展开。
**「一段能力描述」在多选场景里是不可扫描的；必须结构化成固定槽位。**

对本项目的映射：一句话人设不能是自由文本，必须是**固定槽位的模板**
（这也正好符合零 AI 依赖原则）。见 [5.3](#53-一句话人设)。

#### 2.4.3 《暗黑破坏神 IV》（反面教材）

- <https://us.forums.blizzard.com/en/d4/t/feedback-character-sheet-and-hidden-stats/12194>
- <https://us.forums.blizzard.com/en/d4/t/misleading-and-missing-stats-in-stat-menu/210083>

玩家反馈里最有价值的两条：

1. **「不要向玩家隐藏重要信息。重要性排序是：生存 > 伤害 > 外观。」**
   ——先定义重要性排序，再排版。本项目现在的排序事实上是「外观 > 一切」。
2. **派生值必须能溯源**：
   > "Show where the sources of equipment buffs are coming from when hovering over
   > individual line items"

本项目的 `provenance` 逐字段来源已经做对了这一条，而且做得比暗黑好——
但目前只在详情页的属性面板里，广场层完全看不到。

#### 2.4.4 Owlcat（《开拓者》）UI 复盘 —— 对「图标化」的判决

- <https://owlcat.games/news/60>

一个专业 cRPG UI 团队的原话，值得整段引用：

> "Abilities were also moved to a separate page. This made it possible to not only use icons,
> but also **the full names of the abilities** as well. Subsequently, this turned out to be
> very important... **it is a difficult task to convey the meaning of each ability in an icon,
> and it can be even harder for the player to decipher them all.**"

他们最终**放弃了纯图标，改成图标 + 全名列表**。

**这段话是对本项目 `StatRow.tsx` 里那六个 8×8 像素图标（眼/耳/笔/脑/工具/钥匙）的直接判决。**
它们渲染在 11×11 CSS 像素上，用 `accent` 单色，无文字标签，只有 `<title>` 的悬停提示
（移动端触发不了）。一个专业团队在**大得多的尺寸上、有充足教程时间的游戏里**都放弃了这条路。

---

### 2.5 横向对照总表

| 站点 / 作品 | 一眼抓手 | 缺数据怎么办 | 密度（一屏个数） | 最值得抄的一招 |
|---|---|---|---|---|
| LLM Stats | 6 张冠军卡 + 分数/价格双数字 | `—`，明确声明不估算 | 6 卡 + 15 行 | 限定域最高级文案 |
| Artificial Analysis | Intelligence Index 大数 | 留空 | 图表流 | 图上直接标 Pareto / 最优象限 |
| models.dev | 无（纯表） | `-` | ~40 行 | 一格放两个数字（$in / $out） |
| OpenRouter | Hero 四事实 | 不显示该区块 | 1 个（详情页） | 标价 vs 实付价 |
| LMArena | 分数 + 95% CI | 不上榜 | ~20 行 | CI 重叠即并列 |
| 宝可梦图鉴 | 六条种族值 + 属性徽章 | `???` | 20–24 | 统一归一化 + 条上带数字 |
| FIFA FUT | 左上 OVR 大数 + 卡框色 | 无（数据完整） | 12–15 | 视线动线 < 1 秒 |
| NBA 2K | 徽章名 + 徽章档位 | 无徽章 | — | 徽章表达身份，属性表达上限 |
| 炉石 | 费用/攻击/生命三角 | 无 | 手牌 10 | 只保留数值/卡名/卡图 |
| 杀戮尖塔 | 手牌 + 意图 + 能量同屏 | 无 | — | 图标随档位换形 |
| 文明 VI | 能力一句 + 议程一句 | 无 | 网格 | 固定槽位替代自由文本 |
| Neal.fun | 已知锚点物 | 无 | 1（滚动） | 量级 → 身体动作 |
| ncase.me | 先动手后解释 | 无 | 1 | show **then** tell |
| **本项目（现状）** | **无** | **问号桌 / 未参赛 / 雾** | **18** | — |

---

## 三、诊断：当前设计在信息传达上的九条缺陷

### 缺陷 1｜隐喻是一套「密码」，而不是一种「图形」

**问题**：屋子上共有 9 条以上视觉映射（体型/服饰/冠冕/书架/落灰/电脑/屏幕发光/墙面明暗/雾/钥匙/眼镜/耳机/腰带/檐口形制/围墙）。
它们之间**没有任何一条可以在不查图例的情况下被猜出来**。
而 `Legend.tsx` 的注释里写得很坦白：「默认折叠……代价是新访客可能看不到规则」。

**为什么造成理解成本**：这是一套需要**先记忆、再解码**的符号系统。
读者的实际行为是跳过图例直接看画面，于是画面对他而言是纯装饰。
Nicky Case 的说法是这犯了「tell, don't show」的错——先给抽象规则，再给具体实例。
Owlcat 团队的结论更直接：图标的含义很难传达，一堆图标更难解码，所以他们改用了全名。

**参考站怎么解决**：
- Neal.fun **完全不设图例**，用「潜水员 / 鲸 / 泰坦尼克号」这类已知锚点让读者自我校准。
- ncase 用「先让你拖一下方块，再告诉你这叫谢林隔离模型」。
- 炉石只保留三样东西（数值、卡名、卡图），其余一律砍掉。

---

### 缺陷 2｜过半视觉维度在首屏是常量，等于零信息

**问题**（实测，广场 39 间屋）：

| 视觉元素 | 全场相同的比例 |
|---|---|
| 桌上是同一张问号盖布桌 | 79%（31/39） |
| 角色披同一件雾化斗篷 | 77%（30/39） |
| 名牌右下写「未参赛」 | 69%（27/39） |
| 挂「会用工具」图标 | 74%（29/39） |
| 挂「会深思」图标 | 69%（27/39） |
| 书架落在顶两档 | 59%（23/39） |

**为什么造成理解成本**：信息论意义上，一个在 79% 的样本上取同一个值的变量，
携带的信息量趋近于零，但它占据了屋子右侧约三分之一的宽度。
读者的视觉注意力被平均分配到了「全是常量」的区域，真正的差异反而被稀释。

这个项目**自己已经发现并解决过这个问题**——`assignTraits()` 的 35% 稀有度裁剪，
注释写着「满屏同一块标签等于没有标签」。**但这条规则没有推广到家具、叠加层和属性图标。**

**参考站怎么解决**：
- 宝可梦图鉴对未捕获个体显示 `???`，**而不是画一个占位的图形**。
- LLM Stats 缺数据的格子是 `—`，**一个字符宽**，不是一个组件宽。
- 炉石：「视觉太复杂会把注意力从最重要的三个数字上全部抢走」。

---

### 缺陷 3｜体型 = 参数量，这个维度对普通人既不可读也不可懂

**问题分三层**：

1. **不可读**。`TIER_SCALE` 是 `{1:0.5, 2:0.65, 3:0.79, 4:0.92, 5:1.06}` 作用在 88px 上，
   相邻两档差 12–14 px。但角色的发型体积、有无耳机、坐姿站姿各不相同，
   而且网格里相邻的两间屋不一定档位相邻——**跨行比较高矮几乎不可能**。
   [HANDOFF.md](../HANDOFF.md) 坑 12 已经记录过 LPC 身体轮廓只有三种、
   精灵图本身撑不起 5 档身高。
2. **不可懂**。参数量对完全不懂大模型的人不构成任何概念。
   「700B 参数」不比「1M tokens」更好懂，而且它甚至不直接对应能力。
3. **大部分是估算值**。77% 的广场角色没有真实参数量，披着雾化斗篷。
   [DESIGN.md](../DESIGN.md) 自己写了「神秘的斗篷已成为大厂默认皮肤」——
   这句话作为行业评论很漂亮，作为信息设计是失败的：**一个 77% 触发的状态不是状态，是背景**。

**为什么造成理解成本**：读者花了注意力去比高矮（因为它是画面里最大的视觉差异），
得到的却是一个既不精确、又与「我该用哪个」无关的量。**这是最贵的一次注意力误投放。**

**参考站怎么解决**：宝可梦的六条种族值里没有一条是「体积」；
FIFA 的六项属性里没有一项是「身高」（身高只在球员详情页作为附加事实）。
**能力维度和物理维度必须分开，且物理维度不该占据主视觉。**

---

### 缺陷 4｜没有单一抓手，读者不知道该看哪

**问题**：现在最接近「总评」的是名次 `#1`——
它用 12px 金色像素字排在名牌第二行的最右端，是整张卡上**字号最小的元素之一**，
而且 69% 的屋子这里写的是「未参赛」。

**为什么造成理解成本**：人在扫描一屏卡片时需要一个「排序锚」。
没有锚点，扫描就退化成逐个精读，成本随卡片数线性增长。

**参考站怎么解决**：
- FIFA：**OVR 是全卡最大的字号，在左上角，视线第一站**。
  「In less than a second, you should be able to process the rating...」
- 宝可梦图鉴：`#001` 编号 + 属性徽章双锚点。
- LLM Stats：每行第一列就是序号，第二列 logo，第三列名字。

---

### 缺陷 5｜没有并排对比机制

**问题**：全站没有 compare 功能。想比较 Claude Fable 5 和 Kimi K3，
只能开两个标签页来回切。而这恰恰是「了解各个模型之间的区别」这个诉求最直接的答案。

**为什么造成理解成本**：跨卡片比较依赖工作记忆。
人的工作记忆一次只能持有 3–4 个数字，而每个模型有 8 个以上属性。
**不并排，就只能记不住。**

**参考站怎么解决**：LLM Stats 有 `/models/compare`，
而且**预置了 canonical matchups**——不指望用户自己想出该比什么，
直接给出「旗舰对决 / 最快 / 最划算 / 开源之争」四个入口。

---

### 缺陷 6｜缺少「这个模型适合干什么」这个结论

**问题**：现有的 15 种特征标签里，**没有一种是用途型的**。
它们全是排名型（全球最强/五强/十强/编程第一/记性最好）、
价格型（白菜价/天价/性价比之王）、状态型（刚出生/元老/已退役/开源/会深思）。

排名型标签回答「它排第几」，不回答「我什么时候该用它」。

**为什么造成理解成本**：普通人心里的问题不是「谁最强」，
而是「我要写个东西 / 改段代码 / 读个 PDF，该用哪个」。
现在的站点把这最后一步翻译留给了读者。

**参考站怎么解决**：
- LLM Stats 把用途做成一级导航：`Best AI for Coding / Writing / Math / Research / Long Context / Tool Calling / Reasoning`。
- Artificial Analysis 做了 `Model Recommender`（按 intelligence / speed / cost 三个优先级推荐）。
- NBA 2K 的徽章名就是用途：`Lockdown`、`Post Powerhouse`。
- FIFA 的 OVR 是**按位置加权**的——同一个球员在不同位置有不同总评。

---

### 缺陷 7｜信息密度与信息量严重不匹配

**问题**：一间屋 200 × 246 px，1440×900 首屏能看到 18 间，整页 2.8 屏。
但这 18 间里，实际存在差异的只有：名字、厂商家徽、门楣日期、上下文数字、价格数字、
最多三块标签。**屋内 200×132 的剖面（占卡片面积 54%）里，
右侧 1/3 是全场相同的问号桌，左侧的书架 59% 落在同两档。**

**为什么造成理解成本**：读者必须滚动近三屏才能看完 39 个模型，
而每一屏里能获取的新信息只有几行小字。**滚动成本与信息收益不成比例。**

**参考站怎么解决**：models.dev 一屏 40 行；LLM Stats 一屏 6 卡 + 15 行；
宝可梦网格一屏 20–24。这些站都做到了「一屏看完主要选手」。

---

### 缺陷 8｜广场按「每家一间」分配版面，权重与重要性脱钩

**问题**：`buildPlazaRoster()` 给每个厂商恰好一间屋，同样大小、同样样式。
结果 Trendyol、SDAIA、Swiss AI、Morph 和 OpenAI、Anthropic 拥有完全相同的视觉权重。
更严重的是，**其中 6 间屋连上下文窗口和价格都没有**（名牌上是 `— —`），
它们是完全空白的房间。

**为什么造成理解成本**：「一眼看懂当下的大模型格局」要求版面本身就编码重要性。
现在的等权布局主动抹平了格局。

**参考站怎么解决**：
- LLM Stats 首页只放前 15 名，其余分页。
- Epoch 把「查数据（Data explorers）」和「看结论（Benchmarks）」分成两个入口。
- 宝可梦图鉴的网格是**等权的，但它有搜索/筛选/世代分组**，而且它的受众明确接受「图鉴 = 全集」。

---

### 缺陷 9｜名次的确定性被视觉夸大

**问题**：冠冕规则是硬边界——第 1 金冠、2–5 桂冠、6–10 银冠、11 名以后无冠。
`#10` 和 `#11` 在画面上的差别是「有冠 / 无冠」，而它们的 ECI 差值可能小到没有意义。

**为什么造成理解成本**：读者会把视觉上的离散跳变理解成实力上的离散跳变。

**参考站怎么解决**：LMArena 每个分数都带 95% 置信区间，并明确写「CI 重叠即统计上并列」，
经验阈值是 BT 分差 30–50 分才算一个有意义的名次台阶。指南甚至建议直接跳过 Overall 榜。

> 注：Epoch 的 ECI 是否发布区间需要核实。若上游没有区间数据，
> **不要自己造一个**（违反数据诚信）；退而求其次的做法见 [P2-3](#p2-3-名次的并列带)。

---

## 四、改进方案

设计约束（每一条方案都必须同时满足）：

1. **保留像素游戏感**——这是差异化，不能丢。趣味放在装饰层，信息放在结构层（学 The Pudding）。
2. **零 AI 依赖**——所有文案由结构化字段套模板生成。
3. **数据诚信**——绝不用 0 / `-` / 平均值 / 估算值填补空缺。
4. **自校准**——凡是连续量映射成档位，一律用当前全体的分位数。
5. **静态导出兼容**——Next.js `output: 'export'`，无服务端。

---

### P0（必做，收益最大）

#### P0-1 战力名牌重构

> 解决缺陷 **4**（没有抓手）、**9**（名次确定性被夸大）

**做什么**：把名牌区从「标签 → 名字 → 厂商+名次 → 属性行」四行，
重排成 FIFA 卡片式的视线动线：**名次大数字 → 一句话人设 → 名字 → 厂商 → 属性行**。

**长什么样**（桌面 200px 宽，屋内剖面高度从 132 压到 108）：

```
┌────────────────────────────────┐
│  [屋内剖面 200×108]            │  ← 见 P0-4，砍掉常量家具后压低
├────────────────────────────────┤
│ ┏━━━┓                          │
│ ┃ #1┃  全球前 1%     ← 分位带  │  名次：像素字 28px，金色，全卡最大
│ ┗━━━┛  ▂▃▅▇ 综合智力          │  分位带：12px 中文无衬线
│                                │
│ 全世界综合智力最强的模型        │  ← P0-2 一句话人设，13px 中文
│                                │
│ Claude Fable 5                 │  ← 13px 像素字（拉丁）
│ 🐋 Anthropic        [最强][编程]│  ← 12px + 标签右对齐
│ 1M  $50  👁 🧠 🔧              │  ← StatRow 保留
└────────────────────────────────┘
```

**未参赛的屋子长这样**（诚实且视觉上明确区分）：

```
┌────────────────────────────────┐
│ ┏━━━┓                          │
│ ┃ ? ┃  未参赛                  │  名次位是一个像素问号，灰色描边不填充
│ ┗━━━┛  尚未被独立评测收录       │
│                                │
│ 262K 上下文、支持工具调用的开源模型│  ← 人设降级到「定位式」，见 P0-2 兜底
```

**具体改动**

| 文件 | 改动 |
|---|---|
| `src/components/character/ModelRoom.tsx` | 名牌区重排；名次从右下角移到左上角并放大 |
| `src/lib/derive.ts` | 新增 `eciPercentileBand(rank, total)` |
| `src/app/globals.css` | `--room-h: 132px → 108px` |

**分位带的档位**（自校准，不写死绝对分数）：

```ts
// 输入：ECI 名次 rank、上榜总数 total（当前 172）
// 输出：'top1' | 'top5' | 'top10' | 'top25' | 'top50' | 'rest'
// 文案：全球前 1% / 前 5% / 前 10% / 前 25% / 前一半 / 已上榜
```

**数据来源**：`benchmarks.eci` + 现有 `rankByEci()`。零新增数据源。

**为什么这个分位带能缓解缺陷 9**：分位带是**连续量的粗分箱**，
`#10` 和 `#11` 会落在同一个「全球前 10%」的箱里（172 个上榜模型的 10% 是 17 名），
而不是「有冠/无冠」的硬跳变。冠冕可以保留（它是画面趣味），
但**读者的判断依据从冠冕移到了分位带**。

---

#### P0-2 一句话人设（模板化但不生硬）

> 解决缺陷 **6**（缺少「适合干什么」）、部分缓解 **1**（不需要图例）

**核心机制：贪心收窄限定域，直到这个模型在某个域里是第一名。**

这个技巧直接来自 LLM Stats 的 `cheapest in the top 10`——
「最便宜」很平庸，「**前十强里**最便宜」既稀有又有用。

**算法**

```
维度 D（每个维度有一个排序函数和一个中文模板词）：
  intelligence  综合智力  ← benchmarks.eci            desc
  coding        写代码    ← swe_verified ?? swe_vendor desc  （不含 Pro，跨赛制不混算）
  memory        记性      ← contextWindow             desc
  cheap         便宜      ← pricing.outputPerMTok      asc  （仅文本输出模型）
  value         划算      ← eci / outputPerMTok        desc

限定域 S（从宽到窄，每个域有一个成员判定和一个中文前缀）：
  all        全世界              总是成立
  open       开源模型里          openWeights === true
  east       中国厂商里          vendor.continent === 'east'
  west       海外厂商里          vendor.continent === 'west'
  million    百万上下文的模型里   contextWindow >= 1_000_000
  top10      十强里              eciRank <= 10
  cheapTier  白菜价档位里         priceTier === 1
  vendor     Anthropic 家族里     同 vendorId

选取规则（**字典序，两个键**）：
  1. 枚举所有 (d, s) 组合，计算该模型在 s 内按 d 排序的名次。
  2. 只保留「名次 == 1」且「|s| >= 5」的组合。
     └ |s| >= 5 这个下限很关键：在一个只有 2 个成员的域里当第一毫无信息量。
  3. 排序键一：**维度优先级**（intelligence > coding > memory > value > cheap），取最高的。
  4. 排序键二：在该维度内，取**域最宽**的那个。
     └ 这个方向很容易搞反。直觉上「域越窄越具体」，但对全球第一的模型来说，
       「百万上下文的模型里综合智力最强」远不如「全世界综合智力最强」有力。
       正确的做法是**从宽到窄找第一个站得住的说法**。
  5. 套模板：`{s前缀}{d模板词}最{强/长/便宜/划算}的模型`
```

**产出示例**（下表由当前 `data/models.json` 实算校验，非杜撰）：

| 模型 | ECI | 命中的 (d, s) | 一句话人设 |
|---|---|---|---|
| Claude Fable 5 | 162.5 · #1 | (intelligence, **all**) | 全世界综合智力最强的模型 |
| Kimi K3 | 157.3 · #9 | (intelligence, **open**) | 开源模型里综合智力最强的 |
| Gemini 3.7 Flash | 157.1 · #10 | (cheap, **top10**)，$3.75 | 十强里最便宜的 |
| MiniMax-M3 | — | (coding, **east**)，80.5 | 中国厂商里最会写代码的 |
| Granite-4.0-H-Small | — | 无 | 白菜价、记性一般、会用工具的开源模型（二级兜底） |
| Mercury 2 | — | 无 | 上游只收录了它的基本信息，还没有公开评测成绩（三级兜底） |

> 校验用的实际排名（ECI 前 10）：Claude Fable 5 162.5 / GPT-5.5 Pro 161.7 /
> Claude Opus 5 161.6 / GPT-5.6 Sol 161.1 / GPT-5.6 Terra 158.9 / GPT-5.5 158.7 /
> GPT-5.4 Pro 158.6 / Claude Opus 4.8 157.7 / **Kimi K3 157.3（前十里唯一的开源模型）** /
> **Gemini 3.7 Flash 157.1（前十里最便宜，$3.75 vs 第二便宜的 $12）**。
> 「前十里最便宜」这条差了 3.2 倍——这正是限定域最高级的价值：
> 一个在全局排第 10 的模型，在「前十最便宜」这个域里是压倒性的第一。

**兜底阶梯（三级，绝不留空、绝不编造）**

```
一级（命中最高级）：{域前缀}{维度}最{X}的模型
二级（没有任何域里是第一 → 定位式描述，纯事实拼接）：
     {价格档词}、{上下文档词}、{能力列表}的{开源/闭源}模型
     例：「便宜、能读长文、会看图的开源模型」
     价格档词取自现有 buildPriceScale 的五档：白菜价/便宜/中档/偏贵/天价
     上下文档词取自 bookshelfOf 的五档：记性短/一般/较长/很长/能读长文
三级（连核心字段都缺 → 诚实说明，不修饰）：
     「上游只收录了它的基本信息，还没有公开的评测成绩」
```

**为什么模板化不会生硬**

1. **稀有度自带变化**。因为要求「在某个域里第一」，同一句模板在全站最多出现一次。
   不会出现 39 间屋写着 39 句「性能优秀的大语言模型」。
2. **限定域提供语义密度**。「开源模型里综合智力最强的」这句话，
   同时告诉了读者：它开源、它很强、它不是全球第一。三个事实，14 个字。
3. **它是自校准的**，和标签系统一样：新模型上榜，旧模型的人设当天自动更新。
4. **零 AI**：纯查表 + 排序 + 字符串拼接，可离线确定性生成。

**具体改动**

| 文件 | 改动 |
|---|---|
| `src/lib/traits.ts` 或新建 `src/lib/persona.ts` | 新增 `buildPersonaContext()` / `personaFor(model)` |
| `src/lib/i18n.ts` | 域前缀词、维度词、档位词进字典（为英文版预留） |
| `src/components/character/ModelRoom.tsx` | 名牌区渲染一句话 |

**注意**：`coding` 维度**只用 `swe_bench_verified ?? swe_bench_vendor`，不含 `swe_bench_pro`**，
理由见 `traits.ts` 里 `sweScore()` 的现有注释与 [HANDOFF.md](../HANDOFF.md) 4.4。

---

#### P0-3 「今日格局」冠军卡横条

> 解决缺陷 **1**（不需图例）、**4**（抓手）、**7**（密度），并承担首屏引导

**做什么**：抄 LLM Stats 的 hero 条，放在村落上方、图例位置。
六张卡，一行（移动端两行三列）。

**长什么样**：

```
┌──────────┬──────────┬──────────┬──────────┬──────────┬──────────┐
│ 全球最强 │ 最会写码 │十强最便宜│ 记性最好 │ 最划算   │ 刚出生   │
│  [头像]  │  [头像]  │  [头像]  │  [头像]  │  [头像]  │  [头像]  │
│ Claude   │ Claude   │ Gemini   │ Grok 4.1 │  （见下  │ Hy4      │
│ Fable 5  │ Opus 5   │ 3.7 Flash│ Fast     │   警告）  │ preview  │
│ 智力 #1  │ 96 分*   │ $3.75    │ 200 万字 │          │ 5 天前   │
└──────────┴──────────┴──────────┴──────────┴──────────┴──────────┘
  * 厂商自评的 SWE-bench Verified，卡上必须标注，见下方注意事项
```

每张卡严格三段（照抄 LLM Stats 的结构）：
1. **限定域最高级**（12px 中文，灰）
2. **模型名 + 32px 像素头像**（头像直接复用 `public/sprites/{slug}.png` 的第一帧）
3. **证明它的那个数字 + 单位**（金色，tabular-nums）

**为什么它同时是首屏引导**：读者不需要理解任何隐喻就能读完这六张卡，
读完就已经掌握了「当下格局」。**像素画在这里只做装饰，不做编码**——
这正是 The Pudding 的「趣味归装饰层，信息归结构层」。

**卡位的选取规则（全部自校准，缺数据就换一张）**

| 卡位 | 排序依据 | 无数据时 |
|---|---|---|
| 全球最强 | `eci` desc #1 | 整张卡不渲染 |
| 最会写代码 | `swe_verified ?? swe_vendor` desc #1 | 整张卡不渲染 |
| 十强里最便宜 | `eciRank <= 10` 内 `outputPerMTok` asc #1 | 降级为「全场最便宜」 |
| 记性最好 | `contextWindow` desc #1 | 整张卡不渲染 |
| 最划算 | `eci / outputPerMTok` desc #1 | 整张卡不渲染 |
| 刚出生 | 30 天内发布且 `eci` 最高；无 eci 则最新 | 降级为「最新登场」 |

**卡位数量是弹性的**：能凑几张就渲染几张，绝不为了凑满六张而放宽标准。
这是数据诚信在版面上的体现。

**三个实算中暴露出来的坑（实现前必读）**

**坑一：编程冠军当前全是厂商自评。**
按 `traits.ts` 现有的 `sweScore()`（`verified ?? vendor`）实算，前五名是
Claude Opus 5 (96, 厂商)、Claude Fable 5 (95, 厂商)、Claude Opus 4.8 (88.6, 厂商)、
Claude Sonnet 5 (85.2, 厂商)、Claude Opus 4.7 (83.47, **Epoch 复跑**)。
**前四名全部是厂商自评，且全部是 Anthropic。**
冠军卡是首屏最醒目的位置，把一个未经第三方复核的数字放上去并称之为「最会写代码」，
风险很高。建议二选一：
- 卡面标注赛制来源（`96 分 · 厂商自评`），把判断权交给读者；或
- 编程冠军**只取 Epoch 复跑那一列**（当前会是 Claude Opus 4.7 83.47），并在卡面注明
  「第三方统一复跑」。这更符合本站「只有第三方测出来的成绩才让屏幕亮起来」的既有立场。

**坑二：`记性最好` 冠军是一个冷门模型。**
实算第一名是 Llama 4 Scout 17B Instruct（3,500,000 tokens），第二是 Grok 4.1 Fast（2M）。
把 Llama 4 Scout 放上首屏冠军位在事实上没错，但它对「当下格局」的表达力很弱。
建议给这张卡加一个**最低门槛**：要求该模型同时有 ECI 分（即被独立评测收录过）。
这不是修改事实，是**限定域**——卡面文案相应改成「上榜模型里记性最好的」。

**坑三（重要）：现有的 `valueScore()` 有量纲偏置，「性价比之王」会被廉价老模型垄断。**

`traits.ts` 现在的算法是 `eci / outputPerMTok`。实算前三名：

```
Llama-3.1-8B-Instruct   $0.08   eci 115.3   →  1441
Mistral Nemo            $0.15   eci 118.3   →   789
GPT OSS 20B             $0.20   eci 136.8   →   684
对照：Claude Fable 5     $50     eci 162.5   →     3.25
```

**比值型指标在分母趋近于 0 时会爆炸**，结果是「性价比之王」永远颁给最便宜的那批，
而不是「又好又省」的那批——这与标签想表达的意思相反。

三个可选修法（都不引入新数据）：

1. **Pareto 前沿**（抄 Artificial Analysis 的 `Pareto line`）：
   一个模型如果不存在「比它便宜且比它强」的模型，它就在前沿上。
   前沿上的模型统一挂「划算」标签。**这是最推荐的做法**——
   它没有任何可调参数，天然自校准，而且在数学上正是「性价比」的正确定义。
2. **分位差**：`ECI 分位 − 价格分位`，两个都是 0–1 的无量纲量，相减不会爆炸。
3. **加下限门槛**：只在 ECI 前 50% 的模型里评比性价比。最简单，但引入了一个魔法数。

> 这条与冠军卡无关也应该修——它影响的是现有的「性价比之王」标签。
> 建议单独开一个改动，优先级等同 P0。

**具体改动**：新建 `src/components/world/ChampionRow.tsx`；
`src/app/page.tsx` 在 `<Legend />` 位置引入；
`src/lib/traits.ts` 的 `valueScore()` 按上述方案一重写。

---

#### P0-4 砍掉常量家具：把 35% 稀有度裁剪推广到视觉层

> 解决缺陷 **2**（常量维度）、**7**（密度）

**核心原则**：`assignTraits()` 的稀有度裁剪不该只管文字标签。
**任何在同屏样本里出现率超过阈值的视觉元素，都应该在广场层降级。**

**具体的四条降级规则**

| 元素 | 当前 | 实测出现率 | 建议 |
|---|---|---|---|
| 问号盖布桌 | 占屋内右 1/3，约 60×40px | 79% | **广场层不画**。降级为名牌属性行末尾一枚 10×10 的灰色 `?` 徽章，`title` 保留原文案「不知道不等于不会」。详情页保留完整的盖布桌家具。 |
| 雾化斗篷 | 从脚下升起的雾气 | 77% | **广场层不画**。降级为名次徽章旁一个 8×8 的小雾点。详情页保留。 |
| 「会用工具」图标 | StatRow 第 5 个 | 74% | 广场层不画（超过 60% 阈值自动隐藏） |
| 「会深思」图标 | StatRow 第 4 个 | 69% | 同上 |

**这不是删除信息，是让视觉权重与信息量匹配。**
「编程能力未知」这个事实**完全保留**——它只是从「占画面 1/3 的家具」
变成了「属性行末尾的一个字符」。诚信原则要求的是「不用视觉元素掩盖数据的缺失」，
而不是「必须给缺失的数据分配和有数据同样多的像素」。

事实上，现在的做法反而更危险：**当 79% 的屋子都有同一张问号桌时，
读者会把它读成一件普通家具，而不是一个「缺数据」的警告。**
稀有的警告才是警告。

**实现方式（自校准，不写死）**

```ts
// src/lib/derive.ts 新增
const VISUAL_COMMON_THRESHOLD = 0.6; // 视觉层比标签层(0.35)宽松一点，因为视觉元素更少

export function buildVisualPruning(models: ModelRecord[]) {
  // 统计每个视觉元素在这批模型里的出现率，
  // 返回 { emptyDesk: boolean, fog: boolean, toolIcon: boolean, thinkIcon: boolean }
  // 表示「这个元素在广场层是否该被裁掉」
}
```

同样自校准：等哪天编程成绩覆盖率上去了，问号桌的出现率跌破 60%，
它会自动回到屋子里——那时候它才真的是一个信号。

**顺带的版面收益**：屋内剖面从 200×132 压到 **168×108**，
名牌略增（要放一句话人设），卡片总高从 246 降到约 **220**，宽从 200 降到 **168**。
1440×900 首屏可见从 18 间升到约 **32 间**，整页从 2.8 屏降到约 **1.6 屏**。

---

#### P0-5 「样板房解剖图」代替九条对照表

> 解决缺陷 **1**（隐喻是密码）

**做什么**：删掉 `Legend.tsx` 的九条 `<Swatch>` 折叠列表，
换成**一间放大 1.8× 的样板房 + 四条引线标注**，默认展开在冠军卡下方。

**为什么是四条不是九条**：炉石的原话——「只有三样东西是必需的，其余都是 bonus」。
按信息量排序，广场层真正值得解释的只有：

```
                    ┌─── ① 头顶王冠 = 综合智力排进前十
                    │
        ╔═══════════▼══════════════════╗
        ║  2026.06  ┌──┐               ║◄── ② 门楣上的年月 = 什么时候发布的
        ║  📚  ┌────┤👑├────┐          ║
        ║  ║   │    └──┘    │          ║
        ║  ║   └── 🧍 ──────┘          ║
   ③ ──►║  ║        人越高大，          ║
        ║  ║        模型规模越大        ║
        ╚══╧═══════════════════════════╝
           │
           └─── ④ 左边书架越高 = 一次能读越多字（上下文窗口）
```

四条标注，每条一句话，引线用 2px 像素虚线（`shapeRendering="crispEdges"`）指向对应部位。

**这为什么比对照表好**（ncase 的 show-then-tell）：
读者看到的是**一个具体的、真实存在的模型**（就用当前 `#1`），
而不是九个抽象色块。「先具体，后抽象；先熟悉，后陌生。」

**交互**：右上角一个「知道了 ✕」按钮，点击后 `localStorage.setItem('legend-dismissed','1')`，
下次访问折叠成一行。静态导出下用一小段内联脚本在 `DOMContentLoaded` 时读 localStorage 决定初始状态
（注意避免 FOUC：默认 CSS 展开，脚本用 `document.documentElement.classList` 在 `<head>` 里同步设置）。

**剩下的五条隐喻怎么办**：全部下沉到详情页的「这间屋子怎么读」区块，
以及各元素的 `title` 悬停提示。它们仍然存在、仍然可查，只是不再在首屏抢注意力。

---

### P1

#### P1-1 五维分段属性条（不是雷达图）

> 解决缺陷 **3**（体型不可读）、**4**（抓手），详细论证见 [5.1](#51-战力雷达图--五维属性条)

**做什么**：在详情页和广场卡片的悬停浮层里，放一组 5 行的分段条。

**长什么样**（每格 10×10 像素方块，5 格满格，`shapeRendering="crispEdges"`）：

```
综合智力  ■■■■■  全球前 1%      ← 5/5 格，金色
写代码    ■■■■□  第 3 名 / 87 家 ← 4/5 格，蓝色
记性      ■■■■■  100 万字        ← 5/5 格，蓝色
便宜      ■□□□□  $50 / 百万字    ← 1/5 格，红色（越贵格越少）
感官      ■■□□□  能看图          ← 2/5 格，紫色（看图+听声+画图，三选)

————————— 缺数据的那一行长这样 —————————
写代码    ?????  未参赛          ← 五个灰色问号方块，不是零格
```

**关键设计决定**

1. **缺数据显示五个问号方块，不是零格**。零格看起来像「这项很差」，
   问号看起来像「不知道」。这是宝可梦图鉴 `???` 的做法，也是数据诚信的直接要求。
2. **每行必须带右侧数值/名次**。宝可梦规格里明确要求「stat bars include numeric
   labels to prevent ambiguity」。条只做粗略比较，数字才是事实。
3. **格数由分位决定，不由绝对值决定**（自校准，同全站惯例）。
   1 格 = 后 20%，5 格 = 前 20%。
4. **五个维度里没有「参数量/体型」**。理由见缺陷 3。
5. **「便宜」这一维要说清方向**（学 AA 的 `Lower is better`）：
   标题写「便宜」而不是「价格」，这样「格子多 = 好」在五行里保持一致。

**数据来源**

| 行 | 字段 | 缺数据时 |
|---|---|---|
| 综合智力 | `benchmarks.eci` | `?????` 未参赛 |
| 写代码 | `swe_verified ?? swe_vendor ?? swe_pro`，**在各自赛制内分位** | `?????` 未参赛 |
| 记性 | `contextWindow` | `?????` 未知 |
| 便宜 | `pricing.outputPerMTok`（反向分位） | `?????` 无公开报价 |
| 感官 | `modalities`（看图/听声/画图，三项计数 → 0/2/3/5 格） | 布尔字段，恒有值 |

> 「写代码」这一行必须在**同赛制内**做分位，并在 `title` 里注明赛制名。
> Pro 赛制的 59.5 分和 Verified 的 78.7 分不能落在同一把尺子上。

**像素实现**（无需新依赖）：

```tsx
// 5 个 10×10 方块 + 1px 间隔 = 54px 宽
<svg viewBox="0 0 54 10" width={54} height={10} shapeRendering="crispEdges">
  {[0,1,2,3,4].map(i => (
    <rect key={i} x={i*11} y={0} width={10} height={10}
      fill={i < filled ? color : 'transparent'}
      stroke={i < filled ? 'none' : '#4a4463'} strokeWidth={1} />
  ))}
</svg>
```

---

#### P1-2 并排对比：「擂台」升级成「对比台」

> 解决缺陷 **5**（无对比机制）

**两条路径，建议都做**

**路径 A：预生成的经典对局（静态页，SEO 友好）**

抄 LLM Stats 的 canonical matchups。规则完全确定性：

| 对局标签 | 选取规则 |
|---|---|
| 巅峰对决 | ECI 第 1 vs 第 2 |
| 东西对决 | 西岸 ECI 第 1 vs 东方 ECI 第 1 |
| 开源之争 | 开源模型 ECI 前二 |
| 性价比之战 | `eci/price` 前二 |
| 同门之争 | 每家厂商内 ECI 前二（42 家 → 最多 42 页） |
| 同价位 | 同一价格档内 ECI 前二（5 档 → 5 页） |

URL：`/compare/{slugA}-vs-{slugB}/`。总量约 60–100 页，
当前构建已经产出 535 页，增量可忽略。

**路径 B：自选对比栏（客户端，hash 路由）**

- 每张屋子卡片右上角一个小复选框（像素方框），最多选 3 个。
- 选中后底部浮出一条「对比栏」，显示已选的 3 个像素头像 + 「开始对比」。
- 状态存在 URL hash：`/compare/#claude-fable-5,kimi-k3,glm-5-2`，
  静态页在客户端解析 hash 并从预加载的 JSON 渲染。
  （需要一份精简的 `models-lite.json`，只含对比所需字段，控制在 100KB 以内。）

**对比页长什么样（差异高亮是关键）**

```
                 Claude Fable 5      Kimi K3           GLM-5.2
                 [像素角色 96px]     [像素角色 96px]   [像素角色 96px]
                 🐋 Anthropic        🌙 月之暗面        🧙 智谱

综合智力         ▲ #1               #9                #38
写代码           95.0 (厂商自评)     未参赛             ▲ 78.7 (Epoch复跑)
记性             1M                 1M                1M           ← 三者相同，整行灰掉
输出价格         $50                ▲ $15             ▲ $4.4
开源             闭源                ▲ 开源            ▲ 开源
发布             2026.06            2026.07           2026.06
```

规则：
- **相同的行整行降低对比度（灰掉）**——这是 diff 的核心，把注意力集中到差异上。
- **更优的值加金色 ▲**。
- **无法比较时写「未参赛」并且不判胜负**，绝不给缺数据的一方判负。
- **跨赛制的编程分数并排时必须标注赛制名，且不加 ▲**
  （95.0 是厂商自评的 Verified，78.7 是 Epoch 复跑的 Verified——
  按 [HANDOFF.md](../HANDOFF.md) 4.4，这两个数不能直接比大小）。
  这一条容易被实现者忽略，请务必在代码里加断言。

---

#### P1-3 用途赛道页

> 解决缺陷 **6**（缺少「适合干什么」）

**做什么**：把现有的 `/leaderboard` 从单一总榜扩成多赛道 tab，
并在导航里改名成「**我该用哪个**」或保留「擂台」但加副标题。

**赛道清单**（每条赛道 = 一个已有字段 + 一句用途说明，零新增数据源）

| 赛道 | 中文名 | 排序依据 | 用途说明 |
|---|---|---|---|
| intelligence | 综合最强 | `eci` | 什么都问，要最靠谱的答案 |
| coding | 写代码 | `swe_verified` 优先，分赛制分列 | 改 bug、写脚本、做项目 |
| memory | 读长文 | `contextWindow` | 塞一整本书、一整个代码库进去 |
| cheap | 最便宜 | `outputPerMTok` asc | 量大、预算敏感 |
| value | 最划算 | `eci / outputPerMTok` | 又要好又要省 |
| open | 开源可自部署 | `openWeights` + `eci` | 数据不能出内网 |
| vision | 能看图 | `modalities.input` 含 image + `eci` | 截图、图表、扫描件 |

**每一行的格式（抄 LLM Stats 的双数字模式）**：

```
01  🐋 Claude Fable 5      Anthropic     智力 #1     $50/百万字
02  🌙 Kimi K3             月之暗面       智力 #9     $15/百万字   [开源]
03  🧙 GLM-5.2             智谱          智力 #38    $4.4/百万字  [开源]
```

**分数与价格永远同行**——这是 LLM Stats 最有效的一招，
它让「同分但便宜 2.5 倍」这个结论自己跳出来，不需要额外画性价比图。

**编程赛道要分三张子表**（`Epoch 复跑` / `厂商自评 Verified` / `SWE-Bench Pro`），
表头写明赛制，绝不合并排序。这是 4.4 原则在 UI 上的落地。

---

#### P1-4 上下文窗口的已知锚点

> 解决缺陷 **3** 的同类问题（抽象数字不可懂）

抄 Neal.fun 的锚点法。在 `StatRow` 的 `title`、详情页书架旁、
以及分段条的「记性」行右侧，把 token 数换算成一个人人有概念的东西：

| 上下文 | 锚点文案 |
|---|---|
| ≥ 1M | 一次读完《哈利·波特》全七部 |
| 256K–1M | 一次读完一本《三体》 |
| 128K–256K | 一次读完一部中篇小说 |
| 32K–128K | 一次读完一篇长论文 |
| < 32K | 一次读完几页文档 |

这是一张写死的换算查表，性质同 `vendor-registry.ts`——
**唯一依赖人类常识的一层，加不加系统都能跑**。
放在 `src/data/context-anchors.ts`，五行常量。

> 换算依据要写在注释里（1 token ≈ 0.75 英文词 ≈ 1.5 汉字；
> 《哈利·波特》全七部约 108 万词）。这不是数据，是类比，
> 措辞用「约等于 / 差不多」，不用精确等号。

---

#### P1-5 标签分档（抄 NBA 2K 徽章）

> 解决缺陷 **2**（标签种类过多但档位信息丢失）

现在「全球最强 / 五强 / 十强」是三块不同的标签，
「编程第一 / 编程好手」是两块，「全场最便宜 / 白菜价」是两块。
改成**同一块标签的三档**：

```
综合智力   🥇 最强(#1)   🥈 顶尖(前5)   🥉 十强(前10)
写代码     🥇 第一        🥈 好手(前5)
便宜       🥇 最便宜      🥈 白菜价(前15%)
```

像素实现：标签左侧加一个 6×6 的档位方块（金 `#f5d76e` / 银 `#c8cdd8` / 铜 `#c08a4a`），
文字统一为维度名。这样：
- 标签种类从 15 降到约 8，视觉噪声下降；
- 档位关系变得可比（现在读者不知道「五强」和「编程好手」谁更稀有）；
- 与冠冕的金/桂/银形成同一套色语言（学炉石/杀戮尖塔的「颜色恒定」）。

同时把**用途型标签**加进来（配合 P1-3 的赛道）：
`适合写代码`、`适合读长文`、`适合省钱`——
判定标准就是「在对应赛道里进前 10%」，自校准。

---

#### P1-6 广场版面按重要性分层

> 解决缺陷 **8**（等权布局抹平格局）

把「每家一间等大的屋」改成两级：

- **上榜区**（有 `eci` 的 12 家）：屋子保持 168×220，按名次排。
- **在场区**（无 `eci` 但有核心数据的 21 家）：压缩成 **112×140 的小屋**（无屋内剖面，只有角色 + 名牌两行）。
- **名录区**（无核心数据的 6 家 + 折叠的 3 户）：折叠成一行行的文字列表，可展开。

这样首屏就是「12 间大屋 + 一片小屋」，格局一目了然，
而且**没有任何厂商被删除**——只是版面权重与它在当下格局里的位置对齐了。

---

### P2

#### P2-1 猜谜式引导

抄 NYT «You Draw It»。在首屏冠军卡之前放一个一次性的小测验：

> **「你觉得下面哪个模型最贵？」**
> [ Claude Fable 5 ] [ Gemini 3.7 Flash ] [ GPT-5.5 Pro ]
>
> 选完揭晓：**$50 / $3.75 / $180**，并附一句
> 「最贵的比最便宜的贵 **48 倍**，但综合智力名次只差 8 位（第 2 名 vs 第 10 名）。」

（这组数字是实算的，不是编的：GPT-5.5 Pro ECI 161.7 排第 2、$180；
Gemini 3.7 Flash ECI 157.1 排第 10、$3.75。）

CHI 2017 的对照实验显示，先预测再看数据能显著提升回忆与理解，
且**对读者原本不熟悉的领域提升最大**——正好命中「完全不懂大模型的普通人」。

**但要克制**：2024 年那篇后续实验发现同时展示对比叙事会提高回忆错误率。
所以**一次只猜一个问题**，猜完就进世界，不做成一串问卷。

实现：纯客户端，`localStorage` 记录已答过，静态导出兼容。

#### P2-2 「地价图」：智力 × 价格散点

抄 Artificial Analysis 的 `Intelligence Index vs. Cost per Task`，
但用像素风重画成村落的「地价图」：

- X 轴：输出单价（对数刻度）
- Y 轴：ECI
- 每个点是一个 16×16 的像素头像
- **左上角画一片金色阴影，标注「性价比宝地」**（抄 `Most attractive quadrant`）
- **画出 Pareto 前沿折线，标注「最划算的一批」**

关键在于**把结论标在图上**，而不是让读者自己看散点。
只渲染同时有 ECI 和价格的模型（当前 ~100 个），其余不入图并注明「未参赛的模型不在此图中」。

#### P2-3 名次的并列带

若 Epoch 发布 ECI 的不确定性区间，直接采用（画成名次旁的误差条）。
**若上游没有区间数据，不要自己造一个。** 退而求其次的诚实做法：

在排行榜页加一句固定说明（措辞参考 LMArena 的读法指南）：

> 名次相邻的模型往往差距极小。ECI 相差不到 1 分的模型在实际使用中通常感觉不出区别，
> 建议按「前 5% / 前 10%」这样的档位来看，而不是纠结第 9 名还是第 11 名。

并在冠冕规则旁加一行小字说明这是分档不是精确排序。

#### P2-4 编排动画

[HANDOFF.md](../HANDOFF.md) 里已列为待办。精灵图有 4 方向 9 帧行走循环。
建议的第一个动画不是「新王登基」，而是**冠军卡里的六个角色朝对应方向走两步**——
成本极低，且强化了「这六个是今天的主角」。

---

## 五、专题论证：六个指定思路的展开

### 5.1 战力雷达图 / 五维属性条

**结论：不做雷达图作为主视觉，改做分段条形。**

**理由一（决定性的）：数据覆盖率不支持雷达图。**

雷达图的表达单位是**多边形的形状与面积**，它要求所有轴同时有值。
实测（见 [1.3](#13-五维联合覆盖率决定能不能画雷达图)）：

- 广场 39 个模型里，五轴全有的只有 **3 个（8%）**，≥4 轴的 13 个（33%）。
- 全库 485 个里，五轴全有的 43 个（9%），≥4 轴的 118 个（24%）。
- **同时有综合智力分和编程分的广场模型只有 4 个。**

在只有 2 个轴有数据的模型上画雷达，多边形会缩成一片贴着中心的碎片。
**读者会把它读成「这个模型什么都不行」——而事实是「我们不知道」。**
这直接违反 [HANDOFF.md](../HANDOFF.md) 4.1：
「没有数据就说没有数据。绝不用 0、`-`、平均值或估算值填补空缺。」

雷达图在结构上**无法表达「这一轴缺数据」**：你要么给它一个值（撒谎），
要么让多边形塌陷（也是撒谎）。

**理由二：雷达图本身有已知的感知缺陷。**

- 面积随半径**平方**增长，读者会系统性高估高分模型的优势。
- 多边形形状取决于**轴的排列顺序**，换个顺序同一组数据看起来完全不同。
- 在 200px 宽的卡片上，五边形的边长只有几十像素，像素化后锯齿会掩盖差异。

值得注意的是：**FIFA 没有用雷达图**（六个独立数字），
**宝可梦官方图鉴也没有用雷达图**（六条横条）。
这两个「让一亿人一眼看懂角色特点」的成功案例，
在有完整数据的情况下都选择了条形而非雷达。

**理由三：分段条形逐行独立，天然支持缺数据。**

每一行是一个独立的判断，缺一行不影响其他行的可读性。
宝可梦图鉴对未捕获个体显示 `???` 就是这个思路。

**具体方案见 [P1-1](#p1-1-五维分段属性条不是雷达图)。**

**如果坚持要做雷达图**，唯一可接受的形式是：

```
1. 只在 ≥4 轴有数据时才渲染（当前全库 118 个模型，24%）；
2. 缺失的那一轴不画顶点，多边形在该处**断开**（画成开放折线，不闭合），
   并在轴标签上打 `?`；
3. 只放在详情页，绝不放在广场卡片上；
4. 像素画法：50×50 的 viewBox，五个顶点用
   x = 25 + r*sin(2πi/5), y = 25 - r*cos(2πi/5)，
   坐标 Math.round 到整数像素后再连线，shapeRendering="crispEdges"，
   底层画三圈同心五边形网格（r = 8/16/24）。
```

即便如此，**它也只能作为分段条的补充装饰，不能替代分段条**。

---

### 5.2 单一综合评分

**结论：不造合成总评分。用「名次 + 分位带」作为单一抓手。**

**为什么 FIFA 的 88 分能成立，这里不能**

FIFA 的 OVR 是 35 项属性 × 位置系数的加权和。它成立的前提有三个：

1. **数据完整**：EA 对全部 19,000 名球员的 35 项属性都有值，由几百名球探评定。
2. **同一把尺子**：所有属性都在 0–99 的同一量纲上，由同一套流程产出。
3. **权重有明确语义**：位置系数来自足球的领域知识，和为 1，可解释。

本项目三条全不满足：

1. **数据残缺**：广场上五轴全有的只有 3/39。合成分数意味着对 92% 的模型做插补。
2. **尺子不统一**：`eci` 是 0–165 的指数，`swe_bench_*` 是 0–100 的通过率，
   `webdev_arena_elo` 是 1000–1700 的 Elo，`contextWindow` 是 token 数，
   `outputPerMTok` 是美元。把它们塞进一个加权和，权重的量纲本身就是任意的。
3. **加权平均会向中位数回归**。这个项目**已经在体型档位上栽过一次**
   （[HANDOFF.md](../HANDOFF.md) 坑 11：「加权平均会向中位数回归、压缩值域，
   结果所有旗舰模型全部落在第 4 档」）。合成总评会重演同一个失败。

**推荐方案：名次 + 分位带，零加工**

| 元素 | 值 | 为什么安全 |
|---|---|---|
| 主数字 | `#1`、`#9`、`#38`（ECI 名次） | 名次是排序的直接结果，**没有任何加工**，也不需要解释量纲 |
| 副标签 | 「全球前 1%」「前 10%」 | 分位是名次除以总数，同样零加工，且**自校准** |
| 未上榜 | `#?` + 「未参赛」 | 诚实，且视觉上明确区别于低分 |

**为什么名次比分数更适合普通人**：
`ECI = 142.7` 需要读者先知道这个指数的量程；`#1 / 172` 不需要任何前置知识。
LLM Stats 的排行榜和宝可梦图鉴的 `#001` 都是这个逻辑。

**如果一定要一个「像 88 那样的数字」**，唯一诚实的做法是**直接显示 ECI 原始值取整**
（例如 `143`），旁边一行小字「Epoch 综合智力指数 · 全球第 1 / 共 172」。
它不是合成分，是上游第三方（Epoch，CC-BY 4.0）用公开方法算出的单一指数，
本项目只做转载和排序。但对普通人来说，`143` 的信息量小于 `#1`，
所以**建议名次做主、指数值做副**。

**允许的「多分」而非「总分」**

可以给每个赛道一个分位分（见 P1-1 的分段条），
但**每个赛道只在有数据时显示，缺的显示「未参赛」而不是 0**，
且**绝不把多个赛道的分位再加权成一个数**。
这就是 FIFA「位置加权」思路的正确落地形式：
不是算一个万能总评，而是**按用途分别给分**（P1-3 的赛道页）。

---

### 5.3 一句话人设

**详细算法见 [P0-2](#p0-2-一句话人设模板化但不生硬)。这里补充「怎么才不生硬」的三条理由。**

**理由一：生硬来自泛化，不来自模板。**

生硬的句子是「一款性能优秀的大语言模型」——它对任何模型都成立，所以对任何模型都没用。
本方案的核心机制（贪心收窄限定域直到唯一）从结构上排除了这种句子：
一句人设**必须**建立在「这个模型在某个 ≥5 个成员的域里排第一」这个事实上，
而这个事实在全站最多属于一个模型。

参考 LLM Stats 的 `cheapest in the top 10`——
它读起来一点不像模板，但它显然是模板生成的。

**理由二：Civ VI 证明了固定槽位优于自由文本。**

文明 VI 的每个文明都是「独特能力一句 + 议程一句 + 两个图标」的固定结构。
社区对官方那个把描述堆成 wall of text 的下拉框的评价是
「Nothing less interesting than a wall of text for reading about every unique」。
在**需要横向比较**的场景里，固定槽位比自由文本可扫描得多。

**理由三：兜底阶梯保证永不空洞。**

三级兜底（最高级 → 定位式 → 诚实说明）覆盖了所有情况，
且第三级明确说「还没有公开的评测成绩」而不是编一句好话。
这和 `traits.ts` 现有的兜底标签（`open` / `reasoning`）是同一个模式。

**一批实际产出（用当前数据手推，供验收对照）**

```
Claude Fable 5      全世界综合智力最强的模型
GPT-5.5 Pro         全世界最贵的模型
Kimi K3             开源模型里综合智力最强的
DeepSeek V4 Pro     十强里最便宜的
GLM-5.2             中国厂商里最会写代码的
Gemini 3.7 Flash    百万上下文的模型里综合智力最强的
Granite-4.0-H-Small 白菜价、记性一般、会用工具的开源模型      ← 二级兜底
Mercury 2           上游只收录了它的基本信息，还没有公开评测成绩 ← 三级兜底
```

**实现注意**

- 域成员数 `|s| >= 5` 这个下限要写成常量并加注释，否则会出现
  「Morph 家族里最强的」（该家族只有 1 个模型）这种荒唐句子。
- 域的枚举顺序必须确定性（按域 id 字典序），保证同样输入产出同样字节。
- 中文/英文模板都进 `i18n.ts` 的 `Dict`，为第二期英文版预留。

---

### 5.4 并排对比模式

**详细方案见 [P1-2](#p1-2-并排对比擂台升级成对比台)。这里补充三条容易做错的地方。**

**错误一：把「无数据」判成「输」。**
如果 A 有编程分 78.7、B 未参赛，绝不能给 A 打 ▲。
正确做法：B 那一格写「未参赛」，**两边都不打 ▲**，并在行尾加一句「无法比较」。

**错误二：跨赛制的分数并排显示还打 ▲。**
Claude Fable 5 的 95.0 是厂商自评的 SWE-bench Verified，
GLM-5.2 的 78.7 是 Epoch 统一复跑的 SWE-bench Verified。
[HANDOFF.md](../HANDOFF.md) 4.4 明确规定这两列严格分开。
对比页必须**在数值旁标注来源**，并且**当两边赛制不同时不判胜负**。
建议在代码里写一个断言函数 `assertComparable(a, b, metric)`。

**错误三：让用户自己想该比什么。**
LLM Stats 的做法是给四个预置对局。本项目应该做得更多
（东西对决、同门之争、同价位），因为这些对局本身就是「格局」的一部分。

**静态导出的实现要点**：
路径 A 走 `generateStaticParams()` 预生成；
路径 B 走 URL hash + 客户端渲染，需要一份 `public/models-lite.json`。
两者不冲突，路径 A 的页面里可以放一个「换一个对手」按钮跳到路径 B。

---

### 5.5 首屏引导：五秒内理解规则

**结论：五秒内不该让用户理解「规则」，该让他们理解「格局」。**

这是本次调研最重要的一个观念翻转。

现在的思路是「先教会用户读隐喻，用户才能读懂世界」。
但 Neal.fun 的 The Deep Sea 从不教你「1 像素等于多少米」，
ncase 的 Polygons 从不先讲谢林模型。
**它们在你还没理解任何规则之前，就已经让你获得了第一个结论。**

**三层递进（照抄 ncase 的 Interest Curve）**

| 层 | 内容 | 用时 | 用户获得 |
|---|---|---|---|
| 第 0 秒 | **冠军卡横条**（P0-3） | 5 秒 | 「哦，最强的是 Claude，最便宜的是 DeepSeek」——**一个结论，零规则** |
| 第 5 秒 | **样板房解剖图**（P0-5） | 10 秒 | 「原来书架是记性、王冠是排名」——**具体实例带出四条规则** |
| 第 15 秒 | **村落本身** | 不限 | 用刚学会的四条规则自由扫描 |

**为什么冠军卡放在最前面**：它是 Nicky Case 说的「hook」——
> "Start with a hook: The hook provides an overview, motivates the explorer,
> but doesn't require a lot of upfront knowledge."

**为什么样板房放在第二**：Show then tell。
读者已经在冠军卡里见过 Claude Fable 5 这个名字了，
样板房用的就是它——从熟悉到陌生。

**为什么不能只靠图例**：图例是 tell without show，而且是 listicle 而非故事。

**可选的第 -1 层**：P2-1 的猜谜（「你觉得哪个最贵」）。
它把 hook 变成互动，代价是多花 10 秒。建议 A/B 之后再定。

---

### 5.6 信息密度：一屏该看到几个模型

**目标：首屏（1440×900）看到 30 个以上，全站主要选手在 1.5 屏内看完。**

**当前**：18 间 / 首屏，2.8 屏看完 42 间。
**目标**：约 32 间 / 首屏，1.6 屏看完。

**小屋卡片是不是太大了？是，但问题不在尺寸，在内容。**

200×246 的卡片本身不算大（宝可梦图鉴的卡片也差不多）。
问题是这 246px 高度里：

| 区域 | 高度 | 实际信息量 |
|---|---|---|
| 屋顶 | 18px | 厂商品牌色 + 东西方檐口——**和下面的家徽重复** |
| 屋内剖面 | 132px | 书架（59% 落在同两档）+ 角色 + 空桌（79% 相同） |
| 标签行 | 18px+ | **高信息量** |
| 名字行 | ~17px | **高信息量** |
| 厂商 + 名次行 | ~16px | **高信息量**（但名次太小） |
| 属性行 | ~16px | **高信息量**（但图标不可读） |

**132px 的屋内剖面（占 54% 的高度）承载的有效信息，少于下面 67px 的四行文字。**

**优化路径（按收益排序）**

1. **P0-4 砍常量家具** → 剖面 132 → 108，宽 200 → 168。首屏 18 → 约 26。
2. **P1-6 版面分层** → 27 家无 ECI 的压成小屋。首屏 26 → 约 32，且格局立现。
3. **屋顶与家徽去重** → 屋顶从 18px 压到 10px（只留色条，去掉檐口造型），
   东西方差异改由背景大陆分区表达（`Ground.tsx` 已经在做）。省 8px × 39。
4. **提供「列表视图」切换**（可选，P2）——
   一个小小的像素图标切换到 models.dev 式的紧凑表格，
   给「我就是想快速查」的用户一条快速通道。游戏感保留在默认视图。

**不建议做的密度优化**：
- 不要缩小中文字号（已经是 12px 下限，见 4.5 排版规则）。
- 不要把角色缩到 48px 以下——那样连体型档位都彻底不可辨了，
  倒不如索性砍掉体型这个维度（见缺陷 3）。

---

## 六、明确不建议做的事

| 不做 | 理由 |
|---|---|
| **跨榜合成一个 0–100 总评分** | 覆盖率 8%–33%，合成 = 大规模插补；量纲不统一；加权平均向中位数回归（坑 11 已栽过一次）。见 [5.2](#52-单一综合评分) |
| **雷达图作为广场或卡片主视觉** | 五轴全有的只有 8%；雷达无法表达「这一轴缺数据」；面积编码有已知感知偏差。FIFA 和宝可梦在数据完整的情况下都没用雷达。见 [5.1](#51-战力雷达图--五维属性条) |
| **继续强化「体型 = 参数量」** | 77% 是估算值；LPC 身体轮廓只有三种（坑 12）；参数量对普通人无意义。建议**降级为详情页的一个事实**，不再占主视觉 |
| **用 LLM 生成模型描述** | 违反 4.3 零 AI 依赖；模型人设是幻觉高发区 |
| **引入 Artificial Analysis 的速度/成本数据** | 违反 4.2 合规红线，无论多想要「速度」这个维度 |
| **抓 LMArena 补名次区间** | 违反 4.2。若需区间，只能等 Epoch 发布 |
| **给缺数据的模型一个"估算"分位** | 违反 4.1。宁可显示 `?????` |
| **把中文换成像素字体来提高游戏感** | 违反 4.5，已被反馈两次 |
| **删掉「编程能力未知」这个信息** | P0-4 是**降级视觉权重**，不是删除信息。详情页保留完整的盖布桌 + 原文案 |

---

## 七、验收标准

改完之后用下面四条测，任何一条不过就是没改好。

**测试一：五秒测试（首屏）**
找一个完全不懂大模型的人，看首屏 5 秒后遮住屏幕，问：
「刚才看到的模型里，哪个最强？哪个最便宜？」
**通过标准**：能答对至少一个。（现状：几乎必然答不出——名次是 12px 的角落小字。）

**测试二：差异测试（任意两间屋）**
指着任意两间相邻的屋子问：「这两个模型有什么区别？」
**通过标准**：能说出至少两条，且不需要展开图例。

**测试三：用途测试**
问：「我想让 AI 帮我改代码，看这个网站你会选哪个？」
**通过标准**：能在 30 秒内给出一个答案并说出理由。

**测试四：诚信回归测试（自动化）**
写一个构建期断言脚本，检查：

```
- 页面上不存在任何由缺失字段推导出来的数值（grep 所有 "0" 占位）
- 分段条在字段为 null 时渲染的是问号态而非零格态
- 对比页两侧赛制不同时不出现 ▲
- 一句话人设的域成员数 >= 5
- 冠军卡在数据缺失时整张不渲染而非显示占位
```

建议加进 `scripts/sync/selftest.ts` 现有的 80 项自检里。

**版面量化指标**

| 指标 | 现状 | 目标 |
|---|---|---|
| 首屏（1440×900）可见模型数 | 18 | ≥ 30 |
| 看完广场需要的屏数 | 2.8 | ≤ 1.6 |
| 首屏能读出名次的屋子占比 | 31% | 31%（不变，但视觉上必须能一眼分出「有名次」与「未参赛」） |
| 出现率 > 60% 的视觉元素数量 | 6 | 0 |

---

## 八、参考链接总表

### 游戏化 / 拟人化数据可视化

| 站点 | 链接 |
|---|---|
| Neal.fun · The Deep Sea | <https://neal.fun/deep-sea/> |
| Neal.fun · The Size of Space | <https://neal.fun/size-of-space/> |
| Neal Agarwal 作品集 | <https://nealagarwal.me/> |
| FlowingData 对 Deep Sea 的评述 | <https://flowingdata.com/2019/12/05/scroll-scroll-scroll-through-the-depths-of-the-ocean/> |
| Progressive Value Reading（锚点分类学） | <https://arxiv.org/abs/2602.19853> |
| ncase · Parable of the Polygons | <https://ncase.me/polygons/> |
| ncase · The Evolution of Trust | <https://ncase.me/trust/> |
| ncase · To Build A Better Ballot | <https://ncase.me/ballot/> |
| ncase · How I Make Explorable Explanations | <https://blog.ncase.me/how-i-make-an-explorable-explanation/> |
| ncase · Explorable Explanations（设计模式） | <https://blog.ncase.me/explorable-explanations/> |
| ncase · 4 More Design Patterns | <https://blog.ncase.me/explorable-explanations-4-more-design-patterns/> |
| ncase · How To Explain Things Real Good（讲稿） | <https://ncase.me/StanfordTalk/transcript.html> |
| Awesome Explorables 索引 | <https://github.com/blob42/awesome-explorables> |
| The Pudding | <https://pudding.cool/> |
| NYT · You Draw It（药物过量） | <https://www.nytimes.com/interactive/2017/04/14/upshot/drug-overdose-epidemic-you-draw-it.html> |
| CHI 2017 · Explaining the Gap | <https://pages.cs.wisc.edu/~yeaseulkim/assets/papers/2017_explaning_gap_chi.pdf> |
| 预测式引导的后续对照实验 | <https://arxiv.org/html/2401.05511v1> |
| EuroVis 22 · 视觉信念引导设计空间 | <https://cav-lab.github.io/media/papers/VIBEEuroVis22.pdf> |
| a16z AI Town | <https://github.com/a16z-infra/ai-town> |
| AI Town 角色定义 | <https://github.com/a16z-infra/ai-town/blob/main/data/characters.ts> |

### AI 模型对比类

| 站点 | 链接 |
|---|---|
| LLM Stats 首页 | <https://llm-stats.com/> |
| LLM Stats 对比页 | <https://llm-stats.com/models/compare> |
| LLM Stats · Best AI for Coding | <https://llm-stats.com/leaderboards/best-ai-for-coding> |
| LLM Stats 评分方法论 | <https://llm-stats.com/methodology/llm-stats-score> |
| Artificial Analysis（**仅参考设计**） | <https://artificialanalysis.ai/> |
| AA · Model Recommender | <https://artificialanalysis.ai/models/recommend> |
| AA · Openness Index | <https://artificialanalysis.ai/evaluations/artificial-analysis-openness-index> |
| models.dev | <https://models.dev/> |
| OpenRouter 模型页示例 | <https://openrouter.ai/anthropic/claude-opus-4.5> |
| LMArena 排行榜（**仅参考设计**） | <https://lmarena.ai/leaderboard> |
| Arena-Rank 方法论开源包 | <https://arena.ai/blog/arena-rank/> |
| 如何读 LMArena 的名次区间 | <https://www.propelcode.ai/blog/lm-arena-rank-spread-confidence-intervals-guide> |
| LMArena 2026 指南 | <https://uper.pl/en/blog/arena-ai-llm-leaderboard-guide-2026/> |
| Epoch AI Benchmarking Hub | <https://epoch.ai/benchmarks> |
| Epoch Capabilities Index | <https://epoch.ai/eci> |
| Epoch Models 数据浏览器 | <https://epoch.ai/data/ai-models> |

### 图鉴 / 收集类

| 站点 | 链接 |
|---|---|
| Pokédex 组件规格（种族值条） | <https://mintlify.wiki/scriptvg/compo-dex/components/pokemon-stats> |
| Pokédex 组件库总览 | <https://mintlify.wiki/scriptvg/compo-dex> |
| 一份完整的 Pokédex UI/UX 规格文档 | <https://github.com/niltsiar/kotlin_multiplatform_pokedex/blob/main/docs/project/ui_ux.md> |
| FUT 卡片视觉史（09 → FC24） | <https://futgraphics.com/articles/the-evolution-of-fut-cards-a-visual-history-from-fifa-09-to-ea-fc-24> |
| FIFA 卡片设计演变分析 | <https://energy.co.kr:455/news/a-look-at-historical-fifa-card-design.html> |
| EA Sports 前 UI 设计师作品页（FIFA 20） | <https://stefandinca.ro/fifa20.html> |
| FIFA OVR 算法拆解 | <https://earlygame.com/fifa/fifa-ratings-explained-overall-rating-1> |
| FIFA 评分与位置系数 | <https://www.goal.com/en-us/news/fifa-player-ratings-explained-how-are-the-card-number--stats-decided/1hszd2fgr7wgf1n2b2yjdpgynu> |
| NBA 2K 徽章体系 | <https://www.prismnews.com/hobbies/nba-2k/nba-2k-badges-explained-requirements-tiers-and-build> |
| NBA 2K15 徽章系统的设计初衷 | <https://nba2kw.com/nba-2k15-new-badges-system-replaces-signature-skills-and-will-differentiate-players-even-more-than-ever> |
| 2K 玩法总监谈评分与徽章 | <https://www.sportingnews.com/ca/nba/news/nba-2k20-gameplay-director-mike-wang-talks-nba-2k-ratings/9q8twrhdcmhr1lvwacioibe4f> |
| 徽章 vs 属性的关系 | <https://forums.operationsports.com/forums/nba-2k-basketball/976723-badge-efectiveness-vs-ratings-2k20-vs-2k21.html> |
| 炉石首席美术复盘卡面设计 | <https://hearthstone.blizzard.com/en-us/news/13023802> |
| 炉石可读性设计研究 | <https://www.nickkinggamedesign.com/hearthstone-design-study> |
| 卡牌图形设计六条规则 | <https://shufflekit.com/blog/game-card-graphic-design-rules> |
| Anatomy of a Card | <https://fantastic-factories.medium.com/anatomy-of-a-card-840cdc2404c1> |
| 卡牌设计三原则（可见性/层级/简洁） | <https://danielsolisblog.blogspot.com/2024/02/three-principles-of-card-design.html> |

### RPG 属性面板

| 站点 | 链接 |
|---|---|
| 杀戮尖塔 UI 复盘 | <https://www.cloudfallstudios.com/blog/2018/2/20/flash-thoughts-slay-the-spires-ui> |
| 杀戮尖塔 Patch 44（250+ 条措辞一致性修订） | <https://gameupdatenotifier.com/g/slay-the-spire/v/weekly-patch-44-chrysalis> |
| 游戏 UI 的认知负荷与清晰度 | <https://uxcheckpoint.com/p/on-cognitive-load-and-clarity> |
| 卡牌构筑游戏 UI 最佳实践 | <https://www.gunslingersrevenge.com/posts/development/deckbuilder-ui-design-best-practices.html> |
| 杀戮尖塔产品案例研究 | <https://blog.birdor.com/slay-the-spire-deckbuilding-product-case-study/> |
| 文明 VI 领袖能力与议程总表 | <https://www.eurogamer.net/civilization-6-leader-list-agenda-trait-unit-4879> |
| 文明 VI 领袖（维基） | <https://civilization.fandom.com/wiki/Leaders_(Civ6)> |
| Sukritact 的文明选择界面（对官方界面的批评） | <https://forums.civfanatics.com/threads/sukritacts-civ-selection-screen.605526/> |
| 暗黑破坏神 IV 角色面板反馈 | <https://us.forums.blizzard.com/en/d4/t/feedback-character-sheet-and-hidden-stats/12194> |
| 暗黑破坏神 IV 属性菜单的误导与缺失 | <https://us.forums.blizzard.com/en/d4/t/misleading-and-missing-stats-in-stat-menu/210083> |
| Owlcat（开拓者）UI 复盘：为什么放弃纯图标 | <https://owlcat.games/news/60> |
| 游戏 HUD 思路用于数据可视化 | <https://databricks.cloud/revolutionizing-data-visualization-the-role-of-gaming-ui-in-> |
| 运动中的可视化：用户体验研究 | <http://petra.isenberg.cc/publications/papers/Yao_2025_UXVIM.pdf> |

---

## 附：一句话总结

> 这个站现在把「趣味」和「信息」编码在了同一层——用衣服的华丽度表达价格，
> 于是读者必须先学一套密码才能读懂画面。
> 而 The Pudding、Neal.fun、宝可梦图鉴的共同做法是**把两层分开**：
> 趣味全部交给装饰（贴纸、锚点物、剪影），信息全部交给结构（编号、条形、一句话）。
>
> **像素画应该让人想留下来，而不是让人需要被教会。**
